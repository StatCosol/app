import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AuditEntity } from './entities/audit.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AuditType, Frequency } from '../common/enums';

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
export class AuditsService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
    private readonly dataSource: DataSource,
  ) {}

  private assertCrm(user: any) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  private assertAuditor(user: any) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  private normalizeAndValidateFrequency(freq: Frequency): Frequency {
    if (!Object.values(Frequency).includes(freq)) {
      throw new BadRequestException('Invalid frequency');
    }
    return freq;
  }

  private normalizeAndValidateAuditType(t: AuditType): AuditType {
    if (!Object.values(AuditType).includes(t)) {
      throw new BadRequestException('Invalid auditType');
    }
    return t;
  }

  /**
   * Generate a human-readable audit code: AUD-YYYY-NNN
   * e.g. AUD-2026-001, AUD-2026-002
   */
  private async generateAuditCode(year: number): Promise<string> {
    const prefix = `AUD-${year}-`;
    const latest = await this.repo
      .createQueryBuilder('a')
      .select('a.auditCode', 'auditCode')
      .where('a.auditCode LIKE :p', { p: `${prefix}%` })
      .orderBy('a.auditCode', 'DESC')
      .limit(1)
      .getRawOne<{ auditCode: string }>();

    let seq = 1;
    if (latest?.auditCode) {
      const num = parseInt(latest.auditCode.replace(prefix, ''), 10);
      if (!isNaN(num)) seq = num + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  async createForCrm(user: any, dto: CreateAuditDto) {
    this.assertCrm(user);

    if (!dto.clientId) {
      throw new BadRequestException('clientId required');
    }

    const client = await this.clientsService.getOrFail(dto.clientId);
    if (!client || client.status !== 'ACTIVE') {
      throw new BadRequestException('Client not active');
    }

    const frequency = this.normalizeAndValidateFrequency(dto.frequency);
    const auditType = this.normalizeAndValidateAuditType(dto.auditType);

    if (!dto.periodYear || !dto.periodCode?.trim()) {
      throw new BadRequestException('periodYear and periodCode required');
    }

    if (!dto.assignedAuditorId) {
      throw new BadRequestException('assignedAuditorId required');
    }

    const auditorRole = await this.usersService.getUserRoleCode(
      dto.assignedAuditorId,
    );
    if (auditorRole !== 'AUDITOR') {
      throw new BadRequestException(
        'assignedAuditorId must be an AUDITOR user',
      );
    }

    // Optional contractor scope validation
    let contractorUserId: string | null = null;
    if (dto.contractorUserId != null) {
      contractorUserId = dto.contractorUserId;
      const contractorRole =
        await this.usersService.getUserRoleCode(contractorUserId);
      if (contractorRole !== 'CONTRACTOR') {
        throw new BadRequestException(
          'contractorUserId must be a CONTRACTOR user',
        );
      }
      const contractor = await this.usersService.findById(contractorUserId);
      if (!contractor || contractor.clientId !== dto.clientId) {
        throw new BadRequestException('Contractor not linked to this client');
      }
    }

    // Ensure CRM is actually assigned to this client
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      dto.clientId,
      user.userId,
    );
    if (!ok) {
      throw new ForbiddenException('Client not assigned to this CRM');
    }

    // Validate branch belongs to client (if provided)
    let branchId: string | null = null;
    if (dto.branchId) {
      const branchRows = await this.dataSource.query(
        `SELECT id FROM branches WHERE id = $1 AND client_id = $2 AND is_active = TRUE`,
        [dto.branchId, dto.clientId],
      );
      if (!branchRows.length) {
        throw new BadRequestException('Branch not found or not linked to this client');
      }
      branchId = dto.branchId;
    }

    const auditCode = await this.generateAuditCode(Number(dto.periodYear));

    const entity = this.repo.create({
      auditCode,
      clientId: dto.clientId,
      branchId,
      contractorUserId,
      frequency,
      auditType,
      periodYear: Number(dto.periodYear),
      periodCode: dto.periodCode.trim(),
      assignedAuditorId: dto.assignedAuditorId,
      createdByUserId: user.userId,
      dueDate: dto.dueDate ?? null,
      notes: dto.notes?.trim() || null,
      status: 'PLANNED',
    });

    const saved = await this.repo.save(entity);
    return { id: saved.id, auditCode: saved.auditCode };
  }

  async listForAuditor(user: any, q: any) {
    this.assertAuditor(user);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .where('a.assignedAuditorId = :uid', { uid: user.userId });

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

  async getForAuditor(user: any, id: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    return audit;
  }

  async listForClient(user: any, q: any) {
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

  async getSummaryForClient(user: any) {
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

  // ─── Branch Audit KPI ─────────────────────────────

  private ensurePeriod(p?: string): string {
    if (!p || !/^\d{4}-\d{2}$/.test(p)) {
      throw new BadRequestException('Invalid period format. Use YYYY-MM');
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
}
