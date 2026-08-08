import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { UsersService } from '../users/users.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';

export interface BranchAuditKpiItem {
  periodCode: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  open: number;
  closed: number;
}

@Injectable()
export class AuditListingService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  private assertCrm(user: ReqUser) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  private assertContractor(user: ReqUser) {
    if (!user || user.roleCode !== 'CONTRACTOR') {
      throw new ForbiddenException('Contractor access only');
    }
  }

  // ─── CRM: list audits for assigned clients ──────────────────────
  async listForCrm(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
      clientId?: string;
      auditType?: string;
    },
  ) {
    this.assertCrm(user);

    // Get all clients assigned to this CRM
    const assignedClientIds =
      await this.assignmentsService.getAssignedClientsForCrm(user.userId);

    if (!assignedClientIds || assignedClientIds.length === 0) {
      return { data: [], total: 0 };
    }

    const clientIds = assignedClientIds.map((c) => c.id);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .leftJoinAndSelect('a.assignedAuditor', 'auditor')
      .where('a.clientId IN (:...clientIds)', { clientIds });

    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    }
    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }
    if (q.clientId) {
      qb.andWhere('a.clientId = :cid', { cid: q.clientId });
    }
    if (q.auditType) {
      qb.andWhere('a.auditType = :at', { at: q.auditType });
    }

    qb.addSelect(
      "CASE WHEN a.status IN ('PLANNED','IN_PROGRESS') THEN 0 ELSE 1 END",
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('a.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: rows, page, pageSize, total };
  }

  async getForCrm(user: ReqUser, id: string) {
    this.assertCrm(user);
    const audit = await this.repo.findOne({
      where: { id },
      relations: ['client', 'contractorUser', 'assignedAuditor'],
    });
    if (!audit) throw new NotFoundException('Audit not found');

    // Verify CRM is assigned to this client
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      audit.clientId,
      user.userId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
    return audit;
  }

  async assignAuditorForCrm(
    user: ReqUser,
    auditId: string,
    dto: {
      assignedAuditorId?: string;
      dueDate?: string | null;
      notes?: string | null;
    },
  ) {
    this.assertCrm(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    const ok = await this.assignmentsService.isClientAssignedToCrm(
      audit.clientId,
      user.userId,
    );
    if (!ok) {
      throw new ForbiddenException('Client not assigned to this CRM');
    }

    if (dto.assignedAuditorId) {
      const auditorRole = await this.usersService.getUserRoleCode(
        dto.assignedAuditorId,
      );
      if (auditorRole !== 'AUDITOR') {
        throw new BadRequestException(
          'assignedAuditorId must be an AUDITOR user',
        );
      }
      audit.assignedAuditorId = dto.assignedAuditorId;
    }

    if (dto.dueDate !== undefined) {
      audit.dueDate = dto.dueDate || null;
    }
    if (dto.notes !== undefined) {
      audit.notes = dto.notes?.trim() || null;
    }

    const saved = await this.repo.save(audit);
    return {
      id: saved.id,
      assignedAuditorId: saved.assignedAuditorId,
      dueDate: saved.dueDate,
      notes: saved.notes,
      updatedAt: saved.updatedAt,
    };
  }

  async getReadinessForCrm(user: ReqUser, id: string) {
    const audit = await this.getForCrm(user, id);
    const [totalObservations, openObservations] = await Promise.all([
      this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId: id })
        .getCount(),
      this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId: id })
        .andWhere(
          `UPPER(COALESCE(obs.status, 'OPEN')) NOT IN ('RESOLVED','CLOSED')`,
        )
        .getCount(),
    ]);

    const executionStarted = ['IN_PROGRESS', 'COMPLETED'].includes(
      String(audit.status || '').toUpperCase(),
    );
    const checklist = [
      {
        key: 'client_scope_linked',
        label: 'Client scope linked',
        ok: !!audit.clientId,
        hint: audit.clientId
          ? 'Client mapping available'
          : 'Client scope missing',
      },
      {
        key: 'period_configured',
        label: 'Period configured',
        ok: !!audit.periodYear && !!audit.periodCode,
        hint:
          audit.periodYear && audit.periodCode
            ? String(audit.periodCode)
            : 'Period year/code missing',
      },
      {
        key: 'auditor_assigned',
        label: 'Auditor assigned',
        ok: !!audit.assignedAuditorId,
        hint: audit.assignedAuditorId || 'Assignment required',
      },
      {
        key: 'schedule_locked',
        label: 'Schedule locked',
        ok: !!audit.dueDate,
        hint: audit.dueDate ? String(audit.dueDate) : 'Due date not set',
      },
      {
        key: 'execution_started',
        label: 'Execution started',
        ok: executionStarted,
        hint: executionStarted
          ? `Current status: ${String(audit.status || '').replace('_', ' ')}`
          : 'Audit not started',
      },
      {
        key: 'capa_tracking_present',
        label: 'CAPA tracking present',
        ok: totalObservations > 0,
        hint:
          totalObservations > 0
            ? `${totalObservations} observations`
            : 'No observations linked yet',
      },
    ];

    return {
      auditId: audit.id,
      checklist,
      metrics: {
        totalObservations,
        openObservations,
      },
    };
  }


  async listForAuditor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      frequency?: string;
      status?: string;
      year?: number | string;
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
    },
  ) {
    this.assertAuditor(user);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.branch', 'branch')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .where('a.assignedAuditorId = :uid', { uid: user.userId })
      .andWhere('COALESCE(client.is_deleted, false) = false');

    if (q.frequency) {
      qb.andWhere('a.frequency = :freq', { freq: q.frequency });
    }
    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    }
    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }
    if (q.clientId) {
      qb.andWhere('a.clientId = :cid', { cid: q.clientId });
    }
    if (q.contractorUserId) {
      qb.andWhere('a.contractorUserId = :kid', { kid: q.contractorUserId });
    }
    if (q.branchId) {
      qb.andWhere('a.branchId = :bid', { bid: q.branchId });
    }

    qb.addSelect(
      "CASE WHEN a.status IN ('PLANNED','IN_PROGRESS') THEN 0 ELSE 1 END",
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('a.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: rows, page, pageSize, total };
  }

  async listForContractor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
      clientId?: string;
      branchId?: string;
    },
  ) {
    this.assertContractor(user);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.branch', 'branch')
      .leftJoinAndSelect('a.assignedAuditor', 'assignedAuditor')
      .where(
        `(a.contractorUserId = :uid OR (
          a.contractorUserId IS NULL
          AND a.clientId = :clientId
          AND a.auditType = :contractorAuditType
          AND (
            a.branchId IS NULL
            OR a.branchId IN (
              SELECT bc.branch_id FROM branch_contractor bc
              WHERE bc.contractor_user_id = :uid
                AND bc.client_id = :clientId
            )
          )
        ))`,
        {
          uid: user.userId,
          clientId: user.clientId,
          contractorAuditType: 'CONTRACTOR',
        },
      )
      .andWhere('COALESCE(client.is_deleted, false) = false');

    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    } else {
      qb.andWhere(
        "a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING')",
      );
    }

    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }
    if (q.clientId) {
      qb.andWhere('a.clientId = :cid', { cid: q.clientId });
    }
    if (q.branchId) {
      qb.andWhere('a.branchId = :bid', { bid: q.branchId });
    }

    qb.addSelect(
      "CASE WHEN a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING') THEN 0 ELSE 1 END",
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('a.scheduledDate', 'ASC', 'NULLS LAST')
      .addOrderBy('a.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: rows, page, pageSize, total };
  }

  async getForAuditor(user: ReqUser, id: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({
      where: { id },
      relations: ['client', 'branch', 'contractorUser', 'assignedAuditor'],
    });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    return audit;
  }


  async listForClient(
    user: ReqUser,
    q: { frequency?: string; status?: string; year?: number | string },
  ) {
    if (!user || user.roleCode !== 'CLIENT') {
      throw new ForbiddenException('CLIENT access only');
    }
    if (!user.clientId) {
      throw new ForbiddenException('Client missing clientId');
    }

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .leftJoinAndSelect('a.assignedAuditor', 'auditor')
      .where('a.clientId = :clientId', { clientId: user.clientId });

    if (q.frequency) {
      qb.andWhere('a.frequency = :freq', { freq: q.frequency });
    }
    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    }
    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }

    qb.orderBy('a.periodYear', 'DESC').addOrderBy('a.createdAt', 'DESC');

    const rows = await qb.getMany();
    return rows;
  }

  async getSummaryForClient(user: ReqUser) {
    if (!user || user.roleCode !== 'CLIENT') {
      throw new ForbiddenException('CLIENT access only');
    }
    if (!user.clientId) {
      throw new ForbiddenException('Client missing clientId');
    }

    const rows = await this.repo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('a.clientId = :clientId', { clientId: user.clientId })
      .groupBy('a.status')
      .getRawMany();

    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let planned = 0;

    for (const r of rows) {
      const status = String(r.status);
      const count = Number(r.count);
      total += count;
      if (status === 'COMPLETED') completed += count;
      if (status === 'IN_PROGRESS') inProgress += count;
      if (status === 'PLANNED') planned += count;
    }

    return { total, completed, inProgress, planned };
  }



  private ensurePeriod(p?: string): string {
    if (!p || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
      throw new BadRequestException(
        'Invalid period format. Use YYYY-MM (month 01-12)',
      );
    }
    return p;
  }

  async getBranchAuditKpi(branchId: string, from: string, to: string) {
    const fromP = this.ensurePeriod(from);
    const toP = this.ensurePeriod(to);

    const rows: BranchAuditKpiItem[] = await this.dataSource.query(
      `SELECT
        a.period_code                                                          AS "periodCode",
        COALESCE(SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int AS critical,
        COALESCE(SUM(CASE WHEN ao.risk = 'HIGH'     THEN 1 ELSE 0 END), 0)::int AS high,
        COALESCE(SUM(CASE WHEN ao.risk = 'MEDIUM'   THEN 1 ELSE 0 END), 0)::int AS medium,
        COALESCE(SUM(CASE WHEN ao.risk = 'LOW'      THEN 1 ELSE 0 END), 0)::int AS low,
        COALESCE(SUM(CASE WHEN ao.status NOT IN ('CLOSED','RESOLVED') THEN 1 ELSE 0 END), 0)::int AS open,
        COALESCE(SUM(CASE WHEN ao.status IN ('CLOSED','RESOLVED')     THEN 1 ELSE 0 END), 0)::int AS closed
      FROM audit_observations ao
      JOIN audits a ON a.id = ao.audit_id
      WHERE a.branch_id = $1
        AND a.period_code >= $2
        AND a.period_code <= $3
      GROUP BY a.period_code
      ORDER BY a.period_code`,
      [branchId, fromP, toP],
    );

    return { branchId, from: fromP, to: toP, items: rows || [] };
  }

  async getBranchAuditKpiSingle(branchId: string, periodCode: string) {
    const p = this.ensurePeriod(periodCode);

    const rows: BranchAuditKpiItem[] = await this.dataSource.query(
      `SELECT
        a.period_code                                                          AS "periodCode",
        COALESCE(SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int AS critical,
        COALESCE(SUM(CASE WHEN ao.risk = 'HIGH'     THEN 1 ELSE 0 END), 0)::int AS high,
        COALESCE(SUM(CASE WHEN ao.risk = 'MEDIUM'   THEN 1 ELSE 0 END), 0)::int AS medium,
        COALESCE(SUM(CASE WHEN ao.risk = 'LOW'      THEN 1 ELSE 0 END), 0)::int AS low,
        COALESCE(SUM(CASE WHEN ao.status NOT IN ('CLOSED','RESOLVED') THEN 1 ELSE 0 END), 0)::int AS open,
        COALESCE(SUM(CASE WHEN ao.status IN ('CLOSED','RESOLVED')     THEN 1 ELSE 0 END), 0)::int AS closed
      FROM audit_observations ao
      JOIN audits a ON a.id = ao.audit_id
      WHERE a.branch_id = $1
        AND a.period_code = $2
      GROUP BY a.period_code
      ORDER BY a.period_code`,
      [branchId, p],
    );

    return { branchId, period: p, items: rows || [] };
  }


  async listContractorsForAuditor(user: ReqUser, clientId: string) {
    this.assertAuditor(user);
    if (!clientId) throw new BadRequestException('clientId required');

    const isAssigned = await this.assignmentsService.isClientAssignedToAuditor(
      clientId,
      user.userId,
    );
    if (!isAssigned) {
      throw new ForbiddenException('Client not assigned to this auditor');
    }

    const rows = await this.dataSource.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.client_id = $1
         AND r.code = 'CONTRACTOR'
         AND u.is_active = TRUE
         AND u.deleted_at IS NULL
       ORDER BY u.name`,
      [clientId],
    );
    return rows;
  }


  async getUploadLockForContractor(user: ReqUser, auditId: string) {
    this.assertContractor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    // allow if this contractor is assigned OR if they share the same client
    if (
      audit.contractorUserId !== user.userId &&
      audit.clientId !== user.clientId
    ) {
      throw new ForbiddenException('Access denied');
    }
    return {
      auditId: audit.id,
      uploadLockFrom: audit.uploadLockFrom ?? null,
      uploadLockUntil: audit.uploadLockUntil ?? null,
      // Item #10: even while locked, REJECTED docs can be re-uploaded so
      // the frontend can surface a helpful banner instead of a hard block.
      allowRejectedReupload: true,
    };
  }


  async getDashboardAudits(
    user: ReqUser,
    tab: string,
    filters: {
      clientId?: string;
      auditType?: string;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<{ items: any[] }> {
    this.assertAuditor(user);

    const clauses: string[] = [
      'a.assigned_auditor_id = $1',
      "a.status != 'CANCELLED'",
    ];
    const params: any[] = [user.userId];

    const p = () => `$${params.length + 1}`;

    const today = new Date().toISOString().slice(0, 10);

    if (tab === 'OVERDUE') {
      clauses.push(`a.due_date < '${today}'`);
      clauses.push("a.status NOT IN ('COMPLETED','SUBMITTED','CLOSED')");
    } else if (tab === 'DUE_SOON') {
      clauses.push(`a.due_date >= '${today}'`);
      clauses.push(
        `a.due_date <= '${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}'`,
      );
      clauses.push("a.status NOT IN ('COMPLETED','SUBMITTED','CLOSED')");
    } else if (tab === 'COMPLETED') {
      clauses.push("a.status IN ('COMPLETED','SUBMITTED','CLOSED')");
    } else {
      // ACTIVE (default)
      clauses.push(
        "a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING')",
      );
    }

    if (filters.clientId) {
      params.push(filters.clientId);
      clauses.push(`a.client_id = ${p()}`);
    }
    if (filters.auditType) {
      params.push(filters.auditType);
      clauses.push(`a.audit_type = ${p()}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`a.due_date >= ${p()}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`a.due_date <= ${p()}`);
    }

    const where = clauses.map((c) => `(${c})`).join(' AND ');

    const rows = await this.dataSource.query(
      `SELECT a.id AS "auditId",
              a.client_id AS "clientId",
              c.client_name AS "clientName",
              a.branch_id AS "branchId",
              COALESCE(cb.branchname, '') AS "branchName",
              CONCAT(a.audit_type, ' – ', a.period_code) AS "auditName",
              a.due_date AS "dueDate",
              a.status AS "status",
              CASE
                WHEN (SELECT COUNT(*) FROM audit_checklist_items ci WHERE ci.audit_id = a.id) = 0 THEN 0
                ELSE ROUND(
                  100.0 * (SELECT COUNT(*) FROM audit_checklist_items ci WHERE ci.audit_id = a.id AND ci.status IN ('REVIEWED','APPROVED'))
                  / (SELECT COUNT(*) FROM audit_checklist_items ci WHERE ci.audit_id = a.id)
                )
              END::int AS "progressPct"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       WHERE ${where}
       ORDER BY
         CASE WHEN a.status = 'IN_PROGRESS' THEN 0 ELSE 1 END,
         a.due_date ASC NULLS LAST
       LIMIT 50`,
      params,
    );

    return { items: rows };
  }

  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
}
