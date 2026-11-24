import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { CreateAuditDto } from './dto/create-audit.dto';
import { ReqUser } from '../access/access-scope.service';
import { AuditType, Frequency } from '../common/enums';
import { isTestAudit } from '../common/actual-records';
import { carryForwardAuditDocuments } from './audit-document-carry-forward';

export class ClientAuditAssignmentDto extends CreateAuditDto {
  @IsUUID() declare clientId: string;
  @IsUUID() declare assignedAuditorId: string;
  @IsOptional() @IsString() previewToken?: string;
}

type Scope = {
  branchId: string;
  branchName: string;
  contractorUserId: string | null;
  contractorName: string | null;
};

/** One CRM action, retaining separate, authorized evidence/report scopes. */
@Injectable()
export class ClientAuditAssignmentService {
  constructor(private readonly db: DataSource) {}

  private validate(user: ReqUser, dto: ClientAuditAssignmentDto) {
    if (user?.roleCode !== 'CRM')
      throw new ForbiddenException('CRM access only');
    if (dto.branchId || dto.contractorUserId)
      throw new BadRequestException(
        'Client-wide assignment cannot specify an individual branch or contractor',
      );
    if (
      !Object.values(AuditType).includes(dto.auditType) ||
      !Object.values(Frequency).includes(dto.frequency) ||
      !Number.isInteger(dto.periodYear) ||
      dto.periodYear < 2000 ||
      dto.periodYear > 2100 ||
      !dto.periodCode?.trim() ||
      dto.periodCode.trim().length > 20 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dto.dueDate || '') ||
      Number.isNaN(Date.parse(dto.dueDate!)) ||
      new Date(dto.dueDate!).toISOString().slice(0, 10) !== dto.dueDate
    )
      throw new BadRequestException(
        'Select a valid audit type, frequency, period and due date',
      );
  }

  private async plan(
    manager: EntityManager,
    user: ReqUser,
    dto: ClientAuditAssignmentDto,
  ) {
    // All reads reuse the transaction connection, including authorization.
    const clients = await manager.query(
      `SELECT c.id FROM clients c
      JOIN client_assignments_current ca ON ca.client_id=c.id
      WHERE c.id=$1 AND c.status='ACTIVE' AND COALESCE(c.is_deleted,FALSE)=FALSE
      AND ca.assignment_type='CRM' AND ca.assigned_to_user_id=$2`,
      [dto.clientId, user.userId],
    );
    if (!clients.length)
      throw new ForbiddenException('Active client is not assigned to this CRM');
    const auditors = await manager.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=$1 AND r.code='AUDITOR' AND u.is_active=TRUE AND u.deleted_at IS NULL`,
      [dto.assignedAuditorId],
    );
    if (!auditors.length)
      throw new BadRequestException('Select an active auditor');
    const branches: Array<{ id: string; name: string }> = await manager.query(
      `SELECT id,branchname AS name FROM client_branches
      WHERE clientid=$1 AND isactive=TRUE AND COALESCE(isdeleted,FALSE)=FALSE ORDER BY id`,
      [dto.clientId],
    );
    if (!branches.length)
      throw new BadRequestException('This client has no active branches');
    const contractors: Array<{ branchId: string; id: string; name: string }> =
      dto.auditType === AuditType.CONTRACTOR
        ? await manager.query(
            `SELECT DISTINCT bc.branch_id AS "branchId",u.id,u.name FROM branch_contractor bc
        JOIN users u ON u.id=bc.contractor_user_id JOIN roles r ON r.id=u.role_id
        WHERE bc.client_id=$1 AND bc.branch_id=ANY($2::uuid[]) AND r.code='CONTRACTOR'
          AND u.is_active=TRUE AND u.deleted_at IS NULL ORDER BY bc.branch_id,u.id`,
            [dto.clientId, branches.map((b) => b.id)],
          )
        : [];
    const scopes: Scope[] = branches.flatMap<Scope>((b) =>
      dto.auditType === AuditType.CONTRACTOR
        ? contractors
            .filter((c) => c.branchId === b.id)
            .map((c) => ({
              branchId: b.id,
              branchName: b.name,
              contractorUserId: c.id,
              contractorName: c.name,
            }))
        : [
            {
              branchId: b.id,
              branchName: b.name,
              contractorUserId: null,
              contractorName: null,
            },
          ],
    );
    const uncoveredBranches = branches.filter(
      (b) => !scopes.some((s) => s.branchId === b.id),
    );
    const existing: Array<{
      id: string;
      auditCode: string;
      branchId: string | null;
      contractorUserId: string | null;
      assignedAuditorId: string;
      status: string;
      notes: string | null;
    }> = await manager.query(
      `SELECT id,audit_code AS "auditCode",branch_id AS "branchId",contractor_user_id AS "contractorUserId",assigned_auditor_id AS "assignedAuditorId",status,notes
      FROM audits WHERE client_id=$1 AND audit_type=$2 AND frequency=$3 AND period_year=$4 AND period_code=$5 ORDER BY id`,
      [
        dto.clientId,
        dto.auditType,
        dto.frequency,
        dto.periodYear,
        dto.periodCode.trim(),
      ],
    );
    const test = isTestAudit({ notes: dto.notes });
    const relevant = existing.filter(
      (a) => a.status !== 'CANCELLED' && isTestAudit(a) === test,
    );
    const items = scopes.map((s) => {
      const matches = relevant.filter(
        (a) =>
          a.branchId === s.branchId &&
          (a.contractorUserId || null) === s.contractorUserId,
      );
      return {
        ...s,
        existingIds: matches.map((a) => a.id).sort(),
        action:
          matches.length === 0
            ? 'CREATE'
            : matches.every(
                  (a) => a.assignedAuditorId === dto.assignedAuditorId,
                )
              ? 'EXISTING'
              : 'CONFLICT',
      };
    });
    const blocking = relevant
      .filter(
        (a) =>
          !a.branchId ||
          (dto.auditType === AuditType.CONTRACTOR && !a.contractorUserId),
      )
      .map((a) => a.auditCode || a.id);
    const token = createHash('sha256')
      .update(
        JSON.stringify({
          clientId: dto.clientId,
          auditor: dto.assignedAuditorId,
          type: dto.auditType,
          frequency: dto.frequency,
          year: dto.periodYear,
          period: dto.periodCode.trim(),
          due: dto.dueDate,
          notes: dto.notes?.trim() || '',
          items,
          uncoveredBranches,
          blocking,
        }),
      )
      .digest('hex');
    return {
      items,
      uncoveredBranches,
      blocking,
      branchCount: branches.length,
      createCount: items.filter((i) => i.action === 'CREATE').length,
      existingCount: items.filter((i) => i.action === 'EXISTING').length,
      canAssign:
        items.length > 0 &&
        !blocking.length &&
        !items.some((i) => i.action === 'CONFLICT'),
      previewToken: token,
    };
  }

  async preview(user: ReqUser, dto: ClientAuditAssignmentDto) {
    this.validate(user, dto);
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.plan(manager, user, dto),
    );
  }

  async assign(user: ReqUser, dto: ClientAuditAssignmentDto) {
    this.validate(user, dto);
    if (!dto.previewToken)
      throw new BadRequestException('Preview the client-wide assignment first');
    return this.db.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [
          `client-audit:${dto.clientId}:${dto.auditType}:${dto.frequency}:${dto.periodYear}:${dto.periodCode.trim()}`,
        ],
      );
      const plan = await this.plan(manager, user, dto);
      if (plan.previewToken !== dto.previewToken)
        throw new ConflictException(
          'Coverage or existing audits changed. Preview the assignment again.',
        );
      if (!plan.canAssign)
        throw new BadRequestException(
          'Resolve conflicting or incomplete existing audits before assigning this client',
        );
      const group = `CA-${randomUUID()}`;
      const until = new Date(`${dto.dueDate}T00:00:00Z`);
      until.setUTCDate(until.getUTCDate() + 7);
      const created: Array<{ id: string; auditCode: string | null }> = [];
      for (const scope of plan.items.filter((i) => i.action === 'CREATE')) {
        const id = randomUUID(),
          auditCode = `CA-${randomUUID().replace(/-/g, '').slice(0, 17)}`;
        // Keep test marker at the start so existing list/count/export isolation applies.
        const notes = [
          dto.notes?.trim(),
          `Client-wide assignment ${group}. Branch and contractor evidence remains separately scoped.`,
        ]
          .filter(Boolean)
          .join(' — ');
        await manager.query(
          `INSERT INTO audits
          (id,audit_code,client_id,branch_id,contractor_user_id,assigned_auditor_id,created_by_user_id,frequency,audit_type,period_year,period_code,status,due_date,upload_lock_from,upload_lock_until,notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PLANNED',$12,$12,$13,$14)`,
          [
            id,
            auditCode,
            dto.clientId,
            scope.branchId,
            scope.contractorUserId,
            dto.assignedAuditorId,
            user.userId,
            dto.frequency,
            dto.auditType,
            dto.periodYear,
            dto.periodCode.trim(),
            dto.dueDate,
            until.toISOString().slice(0, 10),
            notes,
          ],
        );
        created.push({ id, auditCode });
        await carryForwardAuditDocuments(manager, {
          id,
          auditCode,
          clientId: dto.clientId,
          branchId: scope.branchId,
          contractorUserId: scope.contractorUserId,
          auditType: dto.auditType,
          notes,
        });
      }
      return {
        assignmentReference: group,
        created,
        existingCount: plan.existingCount,
        uncoveredBranches: plan.uncoveredBranches,
      };
    });
  }
}
