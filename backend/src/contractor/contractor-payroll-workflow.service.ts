import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { ContractorMcdComputationEntity } from './entities/contractor-mcd-computation.entity';

export interface PayrollVersion {
  id: string;
  client_id: string;
  branch_id: string | null;
  contractor_user_id: string;
  period_month: string;
  version: number;
  is_current: boolean;
  status: string;
  rows_snapshot: ContractorMcdComputationEntity[];
  branch_name?: string;
  contractor_name?: string;
  created_by: string;
  approved_by: string | null;
  verified_by: string | null;
}

export const PUBLISHED_PAYROLL = ['CRM_APPROVED', 'VERIFIED_LOCKED'];
export const DRAFT_PAYROLL_ROLES = ['CONTRACTOR', 'CRM', 'ADMIN'];

@Injectable()
export class ContractorPayrollWorkflowService {
  constructor(
    @InjectRepository(ContractorMcdComputationEntity)
    private readonly repo: Repository<ContractorMcdComputationEntity>,
    private readonly scope: AccessScopeService,
  ) {}

  // Both recalculation and state changes take this lock, including the first
  // version where no row exists yet. Snapshot and live rows commit together.
  async lock(
    manager: EntityManager,
    key: Pick<
      PayrollVersion,
      'client_id' | 'branch_id' | 'contractor_user_id' | 'period_month'
    >,
  ) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [
        [
          key.client_id,
          key.contractor_user_id,
          key.branch_id || '',
          key.period_month,
        ]
          .join(':')
          .toLowerCase(),
      ],
    );
  }

  async saveDraft(
    user: ReqUser,
    key: Pick<
      PayrollVersion,
      'client_id' | 'branch_id' | 'contractor_user_id' | 'period_month'
    >,
    calculate: () => Promise<ContractorMcdComputationEntity[]>,
  ) {
    return this.repo.manager.transaction(async (manager) => {
      await this.lock(manager, key);
      const [previous]: PayrollVersion[] = await manager.query(
        `SELECT * FROM contractor_payroll_versions WHERE client_id=$1 AND contractor_user_id=$2
         AND branch_id IS NOT DISTINCT FROM $3::uuid AND period_month=$4 AND is_current FOR UPDATE`,
        [
          key.client_id,
          key.contractor_user_id,
          key.branch_id,
          key.period_month,
        ],
      );
      if (
        previous &&
        !['DRAFT', 'RETURNED', 'REOPENED'].includes(previous.status)
      ) {
        throw new ConflictException(
          'Payroll is under review or approved. Return or reopen it before recalculating.',
        );
      }
      const output = await calculate();
      const rowsRepo = manager.getRepository(ContractorMcdComputationEntity);
      await rowsRepo
        .createQueryBuilder()
        .delete()
        .where(
          'client_id=:client AND contractor_user_id=:contractor AND branch_id IS NOT DISTINCT FROM :branch::uuid AND period_month=:period',
          {
            client: key.client_id,
            contractor: key.contractor_user_id,
            branch: key.branch_id,
            period: key.period_month,
          },
        )
        .execute();
      const saved = await rowsRepo.save(output);
      if (previous)
        await manager.query(
          'UPDATE contractor_payroll_versions SET is_current=false WHERE id=$1',
          [previous.id],
        );
      const [version]: PayrollVersion[] = await manager.query(
        `INSERT INTO contractor_payroll_versions (client_id,branch_id,contractor_user_id,period_month,version,rows_snapshot,created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
        [
          key.client_id,
          key.branch_id,
          key.contractor_user_id,
          key.period_month,
          (previous?.version || 0) + 1,
          JSON.stringify(saved),
          user.id,
        ],
      );
      await this.event(
        manager,
        version.id,
        user,
        'GENERATED',
        'Attendance calculated into a new draft version',
      );
      return { saved, version: this.summary(version, user) };
    });
  }

  clients(user: ReqUser) {
    return this.scope.listAllowedClients(user);
  }

  async list(user: ReqUser, query: Record<string, string>) {
    const clientId = this.scope.resolveClientId(user, query.clientId);
    if (!clientId) throw new BadRequestException('Select a client');
    await this.scope.assertClientAllowed(user, clientId);
    const scope = await this.scope.getScope(user);
    const params: unknown[] = [clientId];
    const where = ['client_id=$1', 'is_current'];
    if (scope.level === 'branches') {
      params.push(scope.branchIds || []);
      where.push(`branch_id=ANY($${params.length}::uuid[])`);
    }
    if (user.roleCode === 'CONTRACTOR') {
      params.push(user.id);
      where.push(`contractor_user_id=$${params.length}`);
    }
    for (const [field, column] of [
      ['periodMonth', 'period_month'],
      ['branchId', 'branch_id'],
      ['contractorUserId', 'contractor_user_id'],
    ]) {
      if (query[field]) {
        params.push(query[field]);
        where.push(`${column}=$${params.length}`);
      }
    }
    if (!DRAFT_PAYROLL_ROLES.includes(user.roleCode))
      where.push("status IN ('CRM_APPROVED','VERIFIED_LOCKED')");
    const offset = Number(query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new BadRequestException('Invalid page offset');
    params.push(offset);
    const versions: PayrollVersion[] = await this.repo.manager.query(
      `SELECT v.*, (SELECT branchname FROM client_branches WHERE id=v.branch_id) AS branch_name, (SELECT name FROM users WHERE id=v.contractor_user_id) AS contractor_name FROM contractor_payroll_versions v WHERE ${where.join(' AND ')} ORDER BY period_month DESC, created_at DESC, id DESC LIMIT 101 OFFSET $${params.length}`,
      params,
    );
    return {
      data: versions.slice(0, 100).map((v) => this.summary(v, user)),
      hasMore: versions.length > 100,
    };
  }

  private async assertAccess(user: ReqUser, version: PayrollVersion) {
    await this.scope.assertClientAllowed(user, version.client_id);
    if (version.branch_id)
      await this.scope.assertBranchAllowed(user, version.branch_id);
    const scope = await this.scope.getScope(user);
    if (
      scope.level === 'branches' &&
      (!version.branch_id || !scope.branchIds?.includes(version.branch_id))
    ) {
      throw new ForbiddenException('Payroll is outside your assigned branches');
    }
    if (
      user.roleCode === 'CONTRACTOR' &&
      version.contractor_user_id !== user.id
    ) {
      throw new ForbiddenException('Payroll belongs to another contractor');
    }
  }

  allowedActions(version: PayrollVersion, user: ReqUser): string[] {
    if (!version.is_current) return [];
    const role = user.roleCode;
    const actions: string[] = [];
    if (role === 'CONTRACTOR' && ['DRAFT', 'RETURNED'].includes(version.status))
      actions.push('submit');
    if (role === 'CRM' && version.status === 'SUBMITTED')
      actions.push('approve', 'return');
    if (
      role === 'AUDITOR' &&
      version.status === 'CRM_APPROVED' &&
      version.approved_by !== user.id &&
      version.created_by !== user.id
    )
      actions.push('verify', 'return');
    if (
      ['ADMIN', 'CCO'].includes(role) &&
      PUBLISHED_PAYROLL.includes(version.status)
    )
      actions.push('reopen');
    return actions;
  }

  async transition(user: ReqUser, id: string, action: string, reason: string) {
    if (
      typeof reason !== 'string' ||
      reason.trim().length < 10 ||
      reason.length > 2000
    ) {
      throw new BadRequestException(
        'Provide a review reason or evidence reference of 10–2000 characters',
      );
    }
    return this.repo.manager.transaction(async (manager) => {
      const [initial]: PayrollVersion[] = await manager.query(
        'SELECT * FROM contractor_payroll_versions WHERE id=$1',
        [id],
      );
      if (!initial) throw new NotFoundException('Payroll version not found');
      await this.assertAccess(user, initial);
      await this.lock(manager, initial);
      const [version]: PayrollVersion[] = await manager.query(
        'SELECT * FROM contractor_payroll_versions WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!this.allowedActions(version, user).includes(action))
        throw new ForbiddenException(
          'This payroll action is not available for your role or its current state',
        );
      if (
        action === 'approve' &&
        (!version.rows_snapshot.length ||
          version.rows_snapshot.some(
            (r) => r.matchStatus !== 'MATCHED' || Number(r.netSalary) < 0,
          ))
      ) {
        throw new ConflictException(
          'Resolve payroll exceptions and recalculate before approval',
        );
      }
      const status = {
        submit: 'SUBMITTED',
        approve: 'CRM_APPROVED',
        verify: 'VERIFIED_LOCKED',
        return: 'RETURNED',
        reopen: 'REOPENED',
      }[action];
      await manager.query(
        `UPDATE contractor_payroll_versions SET status=$2, updated_at=now(),
         approved_by=CASE WHEN $3='approve' THEN $4::uuid ELSE approved_by END,
         verified_by=CASE WHEN $3='verify' THEN $4::uuid ELSE verified_by END WHERE id=$1`,
        [id, status, action, user.id],
      );
      await this.event(manager, id, user, action.toUpperCase(), reason.trim());
      const [updated]: PayrollVersion[] = await manager.query(
        'SELECT * FROM contractor_payroll_versions WHERE id=$1',
        [id],
      );
      return this.summary(updated, user);
    });
  }

  async history(user: ReqUser, id: string) {
    const [version]: PayrollVersion[] = await this.repo.manager.query(
      'SELECT * FROM contractor_payroll_versions WHERE id=$1',
      [id],
    );
    if (!version) throw new NotFoundException('Payroll version not found');
    await this.assertAccess(user, version);
    if (
      !DRAFT_PAYROLL_ROLES.includes(user.roleCode) &&
      !PUBLISHED_PAYROLL.includes(version.status)
    )
      throw new ForbiddenException('Payroll has not been approved');
    return this.repo.manager.query(
      `SELECT e.action, e.actor_role AS "actorRole", e.reason, e.created_at AS "createdAt", v.version FROM contractor_payroll_events e JOIN contractor_payroll_versions v ON v.id=e.version_id WHERE v.client_id=$1 AND v.contractor_user_id=$2 AND v.branch_id IS NOT DISTINCT FROM $3::uuid AND v.period_month=$4 AND v.version <= $5 ORDER BY v.version, e.created_at, e.id`,
      [
        version.client_id,
        version.contractor_user_id,
        version.branch_id,
        version.period_month,
        version.version,
      ],
    );
  }

  async pack(user: ReqUser, id: string) {
    const [version]: PayrollVersion[] = await this.repo.manager.query(
      'SELECT * FROM contractor_payroll_versions WHERE id=$1',
      [id],
    );
    if (!version) throw new NotFoundException('Payroll version not found');
    await this.assertAccess(user, version);
    if (!version.is_current || !PUBLISHED_PAYROLL.includes(version.status))
      throw new ForbiddenException(
        'Only the current CRM-approved payroll pack can be downloaded',
      );
    return {
      version: this.summary(version, user),
      rows: version.rows_snapshot,
      history: await this.history(user, id),
    };
  }

  private summary(version: PayrollVersion, user: ReqUser) {
    const rows = version.rows_snapshot;
    const total = (key: keyof ContractorMcdComputationEntity) =>
      Math.round(
        rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) * 100,
      ) / 100;
    return {
      id: version.id,
      clientId: version.client_id,
      branchId: version.branch_id,
      branchName: version.branch_name || 'Deployment branch',
      contractorName: version.contractor_name || 'Contractor',
      contractorUserId: version.contractor_user_id,
      periodMonth: version.period_month,
      version: version.version,
      status: version.status,
      employeeCount: rows.length,
      grossWage: total('grossWage'),
      netSalary: total('netSalary'),
      exceptions: rows.filter((r) => r.matchStatus !== 'MATCHED').length,
      allowedActions: this.allowedActions(version, user),
      canDownload:
        version.is_current && PUBLISHED_PAYROLL.includes(version.status),
    };
  }

  private event(
    manager: EntityManager,
    id: string,
    user: ReqUser,
    action: string,
    reason: string,
  ) {
    return manager.query(
      'INSERT INTO contractor_payroll_events(version_id,actor_id,actor_role,action,reason) VALUES ($1,$2,$3,$4,$5)',
      [id, user.id, user.roleCode, action, reason],
    );
  }
}
