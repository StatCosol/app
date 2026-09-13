import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../../access/access-scope.service';
import { RegisterBuilderService } from './register-builder.service';
import { REGISTER_FORMS } from './register-catalogue';
import { legalRegisterType } from './register-identity';
import { assertRegisterContractor } from './register-contractor-source';
import { RegisterInput, validateRegister } from './register-workbook';

const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
@Injectable()
export class RegisterEvidenceService {
  constructor(
    private readonly ds: DataSource,
    private readonly builder: RegisterBuilderService,
  ) {}
  private reviewer(user: ReqUser) {
    return ['ADMIN', 'PAYROLL'].includes(user.roleCode || '');
  }
  private actor(user: ReqUser) {
    const id = user.id || user.userId;
    if (!uuid(id))
      throw new ForbiddenException('A valid signed-in user is required');
    return id;
  }
  private async reuseContext(
    formId: string,
    branchId: string,
    year: number,
    month: number,
    user: ReqUser,
    contractorId?: string,
  ) {
    const ctx = await this.builder.context(formId, branchId, year, month, user);
    const sourceNumber = (
      { XIII: 'I', XIV: 'IX', XV: 'IV', XVI: 'V' } as Record<string, string>
    )[ctx.form.formNumber];
    if (ctx.form.sourceId !== 'osh' || !sourceNumber)
      throw new BadRequestException(
        'No verified register-equivalence rule is configured for this form',
      );
    const source = REGISTER_FORMS.find(
      (f) => f.sourceId === 'cw' && f.formNumber === sourceNumber,
    )!;
    const sourceCtx = await this.builder.context(
      source.id,
      branchId,
      year,
      month,
      user,
    );
    if (contractorId)
      await assertRegisterContractor(
        this.ds,
        ctx.branch.clientId,
        branchId,
        contractorId,
      );
    return {
      ctx,
      source,
      snapshot: {
        target: ctx.applicabilityEvidence,
        source: sourceCtx.applicabilityEvidence,
      },
    };
  }
  async reuseOptions(
    formId: string,
    branchId: string,
    year: number,
    month: number,
    user: ReqUser,
    contractorId?: string,
  ) {
    const { ctx, source } = await this.reuseContext(
      formId,
      branchId,
      year,
      month,
      user,
      contractorId,
    );
    const params = [
      ctx.branch.clientId,
      branchId,
      year,
      month,
      legalRegisterType(source.id),
      contractorId || null,
    ];
    const candidates = await this.ds.query(
      `SELECT r.id,r.title,r.approved_at AS "approvedAt" FROM registers_records r JOIN register_preparation_scopes s ON s.register_id=r.id WHERE r.client_id=$1 AND r.branch_id=$2 AND r.period_year=$3 AND r.period_month=$4 AND r.register_type=$5 AND s.contractor_user_id IS NOT DISTINCT FROM $6::uuid AND r.approval_status='APPROVED' AND r.approved_by_user_id IS NOT NULL AND r.approved_at IS NOT NULL ORDER BY r.created_at DESC LIMIT 100`,
      params,
    );
    const links = await this.ds.query(
      `SELECT l.id,l.source_register_id AS "sourceRegisterId",l.attestation,l.requested_at AS "requestedAt",l.approved_at AS "approvedAt",(l.approved_at IS NOT NULL AND r.approval_status='APPROVED' AND r.approved_at IS NOT NULL AND r.approved_by_user_id IS NOT NULL) AS effective FROM register_reuse_links l JOIN registers_records r ON r.id=l.source_register_id JOIN register_preparation_scopes s ON s.register_id=r.id WHERE l.client_id=$1 AND l.branch_id=$2 AND l.period_year=$3 AND l.period_month=$4 AND l.target_form_id=$5 AND s.contractor_user_id IS NOT DISTINCT FROM $6::uuid ORDER BY l.requested_at DESC LIMIT 100`,
      [
        ctx.branch.clientId,
        branchId,
        year,
        month,
        formId,
        contractorId || null,
      ],
    );
    return {
      candidates,
      links,
      canApprove: this.reviewer(user),
      basis: 'Central OSH Rules 2026, Rule 72(3)',
      sourceFormId: source.id,
    };
  }
  async requestReuse(
    formId: string,
    body: {
      branchId: string;
      year: number;
      month: number;
      contractorId?: string;
      sourceRegisterId: string;
      attestation: string;
    },
    user: ReqUser,
  ) {
    if (
      !body ||
      !uuid(body.sourceRegisterId) ||
      typeof body.attestation !== 'string' ||
      body.attestation.trim().length < 10 ||
      body.attestation.length > 2000
    )
      throw new BadRequestException(
        'Select an approved source and explain why it satisfies this requirement (10–2000 characters)',
      );
    const actor = this.actor(user);
    const { ctx, source, snapshot } = await this.reuseContext(
      formId,
      body.branchId,
      body.year,
      body.month,
      user,
      body.contractorId,
    );
    return this.ds.transaction(async (manager) => {
      const [record] = await manager.query(
        `SELECT r.id FROM registers_records r JOIN register_preparation_scopes s ON s.register_id=r.id WHERE r.id=$1 AND r.client_id=$2 AND r.branch_id=$3 AND r.period_year=$4 AND r.period_month=$5 AND r.register_type=$6 AND s.contractor_user_id IS NOT DISTINCT FROM $7::uuid AND r.approval_status='APPROVED' AND r.approved_by_user_id IS NOT NULL AND r.approved_at IS NOT NULL FOR UPDATE OF r`,
        [
          body.sourceRegisterId,
          ctx.branch.clientId,
          body.branchId,
          body.year,
          body.month,
          legalRegisterType(source.id),
          body.contractorId || null,
        ],
      );
      if (!record)
        throw new BadRequestException(
          'The approved source must match the client, branch, period, workforce and verified Act/form',
        );
      await manager.query(
        `INSERT INTO register_reuse_links(source_register_id,target_form_id,client_id,branch_id,period_year,period_month,basis,attestation,requested_by,applicability_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(source_register_id,target_form_id) DO NOTHING`,
        [
          record.id,
          formId,
          ctx.branch.clientId,
          body.branchId,
          body.year,
          body.month,
          'Central OSH Rules 2026, Rule 72(3)',
          body.attestation.trim(),
          actor,
          JSON.stringify(snapshot),
        ],
      );
      const [link] = await manager.query(
        'SELECT id,approved_at AS "approvedAt" FROM register_reuse_links WHERE source_register_id=$1 AND target_form_id=$2',
        [record.id, formId],
      );
      return link;
    });
  }
  async approveReuse(formId: string, linkId: string, user: ReqUser) {
    if (!this.reviewer(user))
      throw new ForbiddenException(
        'Only payroll or admin users can approve reuse',
      );
    if (!uuid(linkId)) throw new BadRequestException('Invalid reuse request');
    const actor = this.actor(user);
    const [link] = await this.ds.query(
      `SELECT l.*,s.contractor_user_id FROM register_reuse_links l JOIN register_preparation_scopes s ON s.register_id=l.source_register_id WHERE l.id=$1 AND l.target_form_id=$2`,
      [linkId, formId],
    );
    if (!link) throw new BadRequestException('Reuse request not found');
    const { ctx, source, snapshot } = await this.reuseContext(
      formId,
      link.branch_id,
      link.period_year,
      link.period_month,
      user,
      link.contractor_user_id,
    );
    if (link.client_id !== ctx.branch.clientId)
      throw new ForbiddenException('Source client changed');
    return this.ds.transaction(async (manager) => {
      const [record] = await manager.query(
        `SELECT id FROM registers_records WHERE id=$1 AND client_id=$2 AND branch_id=$3 AND period_year=$4 AND period_month=$5 AND register_type=$6 AND approval_status='APPROVED' AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL FOR UPDATE`,
        [
          link.source_register_id,
          ctx.branch.clientId,
          link.branch_id,
          link.period_year,
          link.period_month,
          legalRegisterType(source.id),
        ],
      );
      if (!record)
        throw new BadRequestException(
          'The source is no longer approved or no longer matches this scope',
        );
      await manager.query(
        `UPDATE register_reuse_links SET approved_by=$2,approved_at=now(),applicability_snapshot=$3::jsonb WHERE id=$1 AND approved_at IS NULL`,
        [linkId, actor, JSON.stringify(snapshot)],
      );
      return { id: linkId, approved: true };
    });
  }
  private async operationalContext(
    formId: string,
    branchId: string,
    year: number,
    month: number,
    user: ReqUser,
  ) {
    const ctx = await this.builder.context(formId, branchId, year, month, user);
    if (!['EVENT', 'LEAVE'].includes(ctx.layout.baseFormNumber))
      throw new BadRequestException(
        'Reviewed operational sources are available for event and leave registers only',
      );
    return ctx;
  }
  async sourceList(
    formId: string,
    branchId: string,
    year: number,
    month: number,
    user: ReqUser,
  ) {
    const ctx = await this.operationalContext(
      formId,
      branchId,
      year,
      month,
      user,
    );
    const records = await this.ds.query(
      `SELECT id,source_reference AS reference,revision,created_at AS "createdAt",approved_at AS "approvedAt",input_snapshot AS input FROM register_operational_sources WHERE client_id=$1 AND branch_id=$2 AND form_id=$3 AND period_year=$4 AND period_month=$5 AND is_current ORDER BY created_at DESC LIMIT 100`,
      [ctx.branch.clientId, branchId, formId, year, month],
    );
    return { records, canApprove: this.reviewer(user) };
  }
  async saveSource(formId: string, input: RegisterInput, user: ReqUser) {
    const errors = validateRegister(formId, input);
    if (errors.length)
      throw new BadRequestException({
        message: 'Complete the source details',
        errors,
      });
    const reference = input.supportingReference?.trim();
    if (!reference || reference.length > 300)
      throw new BadRequestException(
        'Use a stable incident or ledger reference (maximum 300 characters); keep the same reference when correcting it',
      );
    if (input.contractorUserId)
      throw new BadRequestException(
        'Operational source records currently require company-worker records',
      );
    const actor = this.actor(user),
      ctx = await this.operationalContext(
        formId,
        input.branchId,
        input.year,
        input.month,
        user,
      );
    return this.ds.transaction(async (manager) => {
      const key = [
        input.branchId,
        formId,
        input.year,
        input.month,
        reference,
      ].join(':');
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [key],
      );
      const params = [
        ctx.branch.clientId,
        input.branchId,
        formId,
        input.year,
        input.month,
        reference,
      ];
      const snapshot = { ...input, supportingReference: reference };
      const [current] = await manager.query(
        `SELECT id,revision,(input_snapshot=$7::jsonb) AS identical FROM register_operational_sources WHERE client_id=$1 AND branch_id=$2 AND form_id=$3 AND period_year=$4 AND period_month=$5 AND source_reference=$6 AND is_current`,
        [...params, JSON.stringify(snapshot)],
      );
      if (current?.identical)
        return { id: current.id, revision: current.revision };
      if (current)
        await manager.query(
          'UPDATE register_operational_sources SET is_current=false WHERE id=$1',
          [current.id],
        );
      const [record] = await manager.query(
        `INSERT INTO register_operational_sources(client_id,branch_id,form_id,period_year,period_month,source_reference,revision,input_snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id,revision`,
        [
          ...params,
          (current?.revision || 0) + 1,
          JSON.stringify(snapshot),
          actor,
        ],
      );
      return record;
    });
  }
  async approveSource(formId: string, sourceId: string, user: ReqUser) {
    if (!this.reviewer(user))
      throw new ForbiddenException(
        'Only payroll or admin users can approve source records',
      );
    if (!uuid(sourceId)) throw new BadRequestException('Invalid source record');
    const actor = this.actor(user);
    const [record] = await this.ds.query(
      'SELECT * FROM register_operational_sources WHERE id=$1 AND form_id=$2 AND is_current',
      [sourceId, formId],
    );
    if (!record)
      throw new BadRequestException('Current source record not found');
    const ctx = await this.operationalContext(
      formId,
      record.branch_id,
      record.period_year,
      record.period_month,
      user,
    );
    if (ctx.branch.clientId !== record.client_id)
      throw new ForbiddenException('Source client changed');
    const errors = validateRegister(formId, record.input_snapshot);
    if (errors.length)
      throw new BadRequestException({
        message: 'Source no longer matches the current schema',
        errors,
      });
    return this.ds.transaction(async (manager) => {
      const [current] = await manager.query(
        'SELECT id,approved_at FROM register_operational_sources WHERE id=$1 AND is_current FOR UPDATE',
        [sourceId],
      );
      if (!current)
        throw new BadRequestException(
          'This source was superseded; review the latest revision',
        );
      if (!current.approved_at)
        await manager.query(
          'UPDATE register_operational_sources SET approved_by=$2,approved_at=now() WHERE id=$1',
          [sourceId, actor],
        );
      return { id: sourceId, approved: true };
    });
  }
}
