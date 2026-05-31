import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ContractorEmployeeEntity } from './entities/contractor-employee.entity';
import { MinimumWageService } from './minimum-wage.service';
import { UserEntity } from '../../users/entities/user.entity';
import { BranchContractorEntity } from '../../branches/entities/branch-contractor.entity';

const SKILL_CATEGORIES = [
  'UNSKILLED',
  'SEMI_SKILLED',
  'SKILLED',
  'HIGHLY_SKILLED',
] as const;
type SkillCategory = (typeof SKILL_CATEGORIES)[number];

const STATUSES = ['ACTIVE', 'LEFT', 'INACTIVE', 'PENDING_DELETE'] as const;
type EmployeeStatus = (typeof STATUSES)[number];

function normalizeSkill(value: any): SkillCategory | null {
  if (value == null || value === '') return null;
  const v = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return (SKILL_CATEGORIES as readonly string[]).includes(v)
    ? (v as SkillCategory)
    : null;
}

function normalizeStatus(value: any): EmployeeStatus | null {
  if (value == null || value === '') return null;
  const v = String(value).trim().toUpperCase();
  return (STATUSES as readonly string[]).includes(v)
    ? (v as EmployeeStatus)
    : null;
}

function toNumberOrNull(value: any): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface BulkRowResult {
  index: number;
  ok: boolean;
  id?: string;
  name?: string;
  error?: string;
}

@Injectable()
export class ContractorEmployeesService {
  constructor(
    @InjectRepository(ContractorEmployeeEntity)
    private readonly repo: Repository<ContractorEmployeeEntity>,
    private readonly minWage: MinimumWageService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Confirm the contractor user is mapped to (clientId, branchId) in
   * branch_contractor. Without this, a contractor can submit any
   * branchId from the same client (or even another client) in the
   * request body and create employees there.
   */
  private async assertContractorBranch(
    clientId: string,
    branchId: string,
    contractorUserId: string,
  ): Promise<void> {
    const link = await this.branchContractorRepo.findOne({
      where: { clientId, branchId, contractorUserId },
      select: ['id'],
    });
    if (!link) {
      throw new BadRequestException('Contractor is not mapped to this branch');
    }
  }

  /** Resolve the contractor user's schedule of employment (cached not needed; light query). */
  private async resolveSchedule(
    contractorUserId: string,
  ): Promise<string | null> {
    if (!contractorUserId) return null;
    const u = await this.userRepo.findOne({
      where: { id: contractorUserId },
      select: ['id', 'scheduledEmployment'],
    });
    return u?.scheduledEmployment ?? null;
  }

  /** Coerce DTO to entity-shape, normalizing enums & numbers. */
  private prepare(
    dto: Partial<ContractorEmployeeEntity> & Record<string, any>,
  ) {
    const skill =
      dto.skillCategory !== undefined
        ? normalizeSkill(dto.skillCategory)
        : undefined;
    const status =
      dto.status !== undefined ? normalizeStatus(dto.status) : undefined;
    const monthlySalary =
      dto.monthlySalary !== undefined
        ? toNumberOrNull(dto.monthlySalary)
        : undefined;
    const dailyWage =
      dto.dailyWage !== undefined ? toNumberOrNull(dto.dailyWage) : undefined;

    const out: Partial<ContractorEmployeeEntity> = { ...dto };
    if (skill !== undefined) out.skillCategory = skill;
    if (status !== undefined && status !== null) out.status = status;
    if (monthlySalary !== undefined) out.monthlySalary = monthlySalary;
    if (dailyWage !== undefined) out.dailyWage = dailyWage;
    // Tenancy fields must NEVER be mutated by the caller through update().
    // create() supplies them via explicit args; strip them defensively here
    // so that an Object.assign() in update() can't move an employee across
    // tenants/branches/contractors via crafted request body.
    delete (out as any).clientId;
    delete (out as any).branchId;
    delete (out as any).contractorUserId;
    delete (out as any).id;
    return out;
  }

  async create(
    clientId: string,
    branchId: string,
    contractorUserId: string,
    dto: Partial<ContractorEmployeeEntity>,
  ): Promise<ContractorEmployeeEntity> {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    await this.assertContractorBranch(clientId, branchId, contractorUserId);
    const prepared = this.prepare(dto);

    // Item #4b: hard-validate against state+skill+schedule min wage.
    const scheduledEmployment = await this.resolveSchedule(contractorUserId);
    await this.minWage.validateSalary({
      stateCode: prepared.stateCode ?? null,
      skillCategory: prepared.skillCategory ?? null,
      monthlySalary: prepared.monthlySalary ?? null,
      scheduledEmployment,
    });

    const emp = this.repo.create({
      ...prepared,
      clientId,
      branchId,
      contractorUserId,
      name: dto.name.trim(),
      isActive: true,
      status: prepared.status ?? 'ACTIVE',
    });
    return this.repo.save(emp);
  }

  /**
   * Bulk create employees from a parsed list (e.g. uploaded Excel rows).
   * Validates each row; returns per-row outcome. Does NOT abort on first error.
   */
  async bulkCreate(
    clientId: string,
    contractorUserId: string,
    defaultBranchId: string | undefined,
    rows: Array<Partial<ContractorEmployeeEntity> & Record<string, any>>,
  ): Promise<{ created: number; failed: number; results: BulkRowResult[] }> {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows supplied');
    }
    if (rows.length > 1000) {
      throw new BadRequestException(
        'Bulk upload limited to 1000 rows per request',
      );
    }

    const results: BulkRowResult[] = [];
    let created = 0;
    let failed = 0;

    // Pre-load this contractor's allowed branches in this client so each
    // row's branchId can be validated cheaply (no per-row DB roundtrip).
    const allowedLinks = await this.branchContractorRepo.find({
      where: { clientId, contractorUserId },
      select: ['branchId'],
    });
    const allowedBranchIds = new Set(allowedLinks.map((l) => l.branchId));

    // Resolve schedule of employment once (shared across all rows for this contractor).
    const scheduledEmployment = await this.resolveSchedule(contractorUserId);

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] || {};
      const name = String(raw.name || '').trim();
      const branchId = String(raw.branchId || defaultBranchId || '').trim();

      if (!name) {
        failed++;
        results.push({ index: i, ok: false, error: 'Name is required' });
        continue;
      }
      if (!branchId) {
        failed++;
        results.push({ index: i, ok: false, error: 'Branch is required' });
        continue;
      }
      if (!allowedBranchIds.has(branchId)) {
        failed++;
        results.push({
          index: i,
          ok: false,
          error: 'Contractor is not mapped to this branch',
        });
        continue;
      }
      // Skill is required at bulk-upload time (Phase 1 contract).
      const skill = normalizeSkill(raw.skillCategory);
      if (!skill) {
        failed++;
        results.push({
          index: i,
          ok: false,
          error:
            'skillCategory is required and must be one of UNSKILLED, SEMI_SKILLED, SKILLED, HIGHLY_SKILLED',
        });
        continue;
      }

      try {
        const prepared = this.prepare({ ...raw, skillCategory: skill });

        // Item #4b: per-row min-wage soft check (warning, not abort).
        const wageWarning = await this.minWage.checkSalary({
          stateCode: prepared.stateCode ?? null,
          skillCategory: prepared.skillCategory ?? null,
          monthlySalary: prepared.monthlySalary ?? null,
          scheduledEmployment,
        });

        const emp = this.repo.create({
          ...prepared,
          clientId,
          branchId,
          contractorUserId,
          name,
          isActive: true,
          status: prepared.status ?? 'ACTIVE',
        });
        const saved = await this.repo.save(emp);
        created++;
        results.push({
          index: i,
          ok: true,
          id: saved.id,
          name: saved.name,
          ...(wageWarning ? { error: `WARNING: ${wageWarning}` } : {}),
        });
      } catch (err: any) {
        failed++;
        results.push({
          index: i,
          ok: false,
          error: err?.message || 'Insert failed',
        });
      }
    }

    return { created, failed, results };
  }

  async list(
    contractorUserId: string,
    filters?: {
      branchId?: string;
      clientId?: string;
      isActive?: boolean;
      search?: string;
    },
  ) {
    const qb = this.repo
      .createQueryBuilder('ce')
      .where('ce.contractorUserId = :contractorUserId', { contractorUserId });

    if (filters?.clientId)
      qb.andWhere('ce.clientId = :clientId', { clientId: filters.clientId });
    if (filters?.branchId)
      qb.andWhere('ce.branchId = :branchId', { branchId: filters.branchId });
    if (filters?.isActive !== undefined)
      qb.andWhere('ce.isActive = :isActive', { isActive: filters.isActive });
    if (filters?.search) {
      qb.andWhere('LOWER(ce.name) LIKE :s', {
        s: `%${filters.search.toLowerCase()}%`,
      });
    }

    qb.orderBy('ce.createdAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async listByBranch(
    clientId: string,
    branchId: string,
    filters?: {
      contractorUserId?: string;
      isActive?: boolean;
      search?: string;
    },
  ) {
    const qb = this.repo
      .createQueryBuilder('ce')
      .where('ce.clientId = :clientId', { clientId })
      .andWhere('ce.branchId = :branchId', { branchId });

    if (filters?.contractorUserId)
      qb.andWhere('ce.contractorUserId = :cuid', {
        cuid: filters.contractorUserId,
      });
    if (filters?.isActive !== undefined)
      qb.andWhere('ce.isActive = :isActive', { isActive: filters.isActive });
    if (filters?.search) {
      qb.andWhere('LOWER(ce.name) LIKE :s', {
        s: `%${filters.search.toLowerCase()}%`,
      });
    }

    qb.orderBy('ce.createdAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(
    id: string,
    contractorUserId?: string,
  ): Promise<ContractorEmployeeEntity> {
    const where: any = { id };
    if (contractorUserId) where.contractorUserId = contractorUserId;
    const emp = await this.repo.findOne({ where });
    if (!emp) throw new NotFoundException('Contractor employee not found');
    return emp;
  }

  async update(
    id: string,
    contractorUserId: string,
    dto: Partial<ContractorEmployeeEntity>,
  ): Promise<ContractorEmployeeEntity> {
    const emp = await this.findById(id, contractorUserId);
    const prepared = this.prepare(dto);
    Object.assign(emp, prepared);

    // Item #4b: re-validate against min-wage using merged state+skill+salary.
    const scheduledEmployment = await this.resolveSchedule(contractorUserId);
    await this.minWage.validateSalary({
      stateCode: emp.stateCode ?? null,
      skillCategory: emp.skillCategory ?? null,
      monthlySalary: emp.monthlySalary ?? null,
      scheduledEmployment,
    });

    return this.repo.save(emp);
  }

  async deactivate(
    id: string,
    contractorUserId: string,
    exitReason?: string,
  ): Promise<ContractorEmployeeEntity> {
    const emp = await this.findById(id, contractorUserId);
    if (emp.status === 'PENDING_DELETE') {
      throw new BadRequestException(
        'Delete request is pending branch approval',
      );
    }
    emp.isActive = false;
    emp.status = 'LEFT';
    emp.dateOfExit = new Date().toISOString().split('T')[0];
    emp.exitReason = exitReason || null;
    return this.repo.save(emp);
  }

  /** Reactivate a previously LEFT/INACTIVE worker. */
  async reactivate(
    id: string,
    contractorUserId: string,
  ): Promise<ContractorEmployeeEntity> {
    const emp = await this.findById(id, contractorUserId);
    if (emp.status === 'PENDING_DELETE') {
      throw new BadRequestException(
        'Delete request is pending branch approval',
      );
    }
    emp.isActive = true;
    emp.status = 'ACTIVE';
    emp.dateOfExit = null;
    emp.exitReason = null;
    return this.repo.save(emp);
  }

  /** Count active contractor employees per branch (for dashboard) */
  async countByBranch(
    clientId: string,
    branchId: string,
  ): Promise<{ total: number; male: number; female: number }> {
    const row = await this.repo.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN LOWER(gender) IN ('m','male') THEN 1 END)::int AS male,
         COUNT(CASE WHEN LOWER(gender) IN ('f','female') THEN 1 END)::int AS female
       FROM contractor_employees
       WHERE client_id = $1 AND branch_id = $2 AND is_active = true`,
      [clientId, branchId],
    );
    return row?.[0] || { total: 0, male: 0, female: 0 };
  }

  async requestDelete(
    id: string,
    contractorUserId: string,
    reason?: string,
  ): Promise<{ message: string; requestId: string; status: string }> {
    const emp = await this.findById(id, contractorUserId);
    if (emp.status === 'PENDING_DELETE') {
      const existing = await this.findPendingDeleteRequest(id);
      if (existing) {
        return {
          message: 'Delete request already pending branch approval',
          requestId: existing.id,
          status: existing.status,
        };
      }
    }

    const existing = await this.findPendingDeleteRequest(id);
    if (existing) {
      emp.status = 'PENDING_DELETE';
      await this.repo.save(emp);
      return {
        message: 'Delete request already pending branch approval',
        requestId: existing.id,
        status: existing.status,
      };
    }

    let rows: Array<{ id: string; status: string }>;
    try {
      rows = await this.dataSource.query(
        `INSERT INTO approval_requests
           (request_type, requester_user_id, target_entity_id, target_entity_type, reason, status, created_at, updated_at)
         VALUES
           ('DELETE_CONTRACTOR_EMPLOYEE', $1, $2, 'CONTRACTOR_EMPLOYEE', $3, 'PENDING', NOW(), NOW())
         RETURNING id::text, status`,
        [
          contractorUserId,
          id,
          reason?.trim() || `Contractor requested deletion of ${emp.name}`,
        ],
      );
    } catch (err: any) {
      if (err?.code !== '23505') throw err;
      const latest = await this.findLatestDeleteRequest(id);
      emp.status = 'PENDING_DELETE';
      await this.repo.save(emp);
      return {
        message: 'Delete request already exists',
        requestId: latest?.id || '',
        status: latest?.status || 'PENDING',
      };
    }

    emp.status = 'PENDING_DELETE';
    await this.repo.save(emp);

    return {
      message: 'Delete request submitted for branch approval',
      requestId: rows?.[0]?.id,
      status: rows?.[0]?.status || 'PENDING',
    };
  }

  async listPendingDeleteRequests(
    clientId: string,
    allowedBranchIds: string[] | 'ALL',
  ): Promise<
    Array<{
      id: string;
      contractorEmployeeId: string;
      contractorEmployeeName: string;
      contractorUserId: string;
      contractorName: string | null;
      branchId: string;
      reason: string | null;
      status: string;
      createdAt: string;
    }>
  > {
    const params: any[] = [clientId];
    let branchSql = '';
    if (allowedBranchIds !== 'ALL') {
      if (!allowedBranchIds.length) return [];
      params.push(allowedBranchIds);
      branchSql = ` AND ce.branch_id = ANY($${params.length}::uuid[])`;
    }
    return this.dataSource.query(
      `SELECT
          ar.id::text AS "id",
          ce.id::text AS "contractorEmployeeId",
          ce.name AS "contractorEmployeeName",
          ce.contractor_user_id::text AS "contractorUserId",
          u.name AS "contractorName",
          ce.branch_id::text AS "branchId",
          ar.reason AS "reason",
          ar.status AS "status",
          ar.created_at AS "createdAt"
       FROM approval_requests ar
       JOIN contractor_employees ce ON ce.id = ar.target_entity_id
       LEFT JOIN users u ON u.id = ce.contractor_user_id
       WHERE ar.request_type = 'DELETE_CONTRACTOR_EMPLOYEE'
         AND ar.target_entity_type = 'CONTRACTOR_EMPLOYEE'
         AND ar.status = 'PENDING'
         AND ce.client_id = $1
         ${branchSql}
       ORDER BY ar.created_at DESC`,
      params,
    );
  }

  async reviewDeleteRequest(
    clientId: string,
    requestId: string,
    reviewerUserId: string,
    decision: 'APPROVED' | 'REJECTED',
    notes: string | null,
    allowedBranchIds: string[] | 'ALL',
  ): Promise<{ ok: true; status: string }> {
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }

    return this.dataSource.transaction(async (mgr) => {
      const rows = await mgr.query(
        `SELECT
            ar.id::text AS id,
            ar.status,
            ar.reason,
            ce.id::text AS contractor_employee_id,
            ce.branch_id::text AS branch_id,
            ce.name
         FROM approval_requests ar
         JOIN contractor_employees ce ON ce.id = ar.target_entity_id
         WHERE ar.id = $1::uuid
           AND ar.request_type = 'DELETE_CONTRACTOR_EMPLOYEE'
           AND ar.target_entity_type = 'CONTRACTOR_EMPLOYEE'
           AND ce.client_id = $2
         FOR UPDATE`,
        [requestId, clientId],
      );
      const req = rows?.[0];
      if (!req) throw new NotFoundException('Delete request not found');
      if (req.status !== 'PENDING') {
        throw new BadRequestException(`Request is already ${req.status}`);
      }
      if (
        allowedBranchIds !== 'ALL' &&
        !allowedBranchIds.includes(req.branch_id)
      ) {
        throw new BadRequestException('Request is outside your branch scope');
      }

      if (decision === 'REJECTED') {
        await mgr.query(
          `UPDATE approval_requests
              SET status = 'REJECTED',
                  approver_user_id = $2,
                  approver_notes = $3,
                  approved_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [requestId, reviewerUserId, notes],
        );
        await mgr.query(
          `UPDATE contractor_employees
              SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
                  updated_at = NOW()
            WHERE id = $1::uuid
              AND status = 'PENDING_DELETE'`,
          [req.contractor_employee_id],
        );
        return { ok: true as const, status: 'REJECTED' };
      }

      await mgr.query(
        `UPDATE contractor_face_enrollments
            SET is_active = false, updated_at = NOW()
          WHERE contractor_employee_id = $1::uuid`,
        [req.contractor_employee_id],
      );
      await mgr.query(
        `UPDATE contractor_face_reenrollment_requests
            SET status = 'CANCELLED', reviewed_by = $2, reviewed_at = NOW(), notes = COALESCE(notes, $3)
          WHERE contractor_employee_id = $1::uuid
            AND status = 'PENDING'`,
        [
          req.contractor_employee_id,
          reviewerUserId,
          'Cancelled after worker deletion',
        ],
      );
      await mgr.query(
        `UPDATE kiosk_enroll_tickets
            SET status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $2,
                reviewed_at = COALESCE(reviewed_at, NOW()),
                reviewed_by = COALESCE(reviewed_by, $2),
                review_notes = COALESCE(review_notes, $3)
          WHERE contractor_employee_id = $1::uuid
            AND status IN ('PENDING', 'REVIEW_PENDING')`,
        [
          req.contractor_employee_id,
          reviewerUserId,
          'Cancelled after worker deletion',
        ],
      );
      await mgr.query(
        `UPDATE contractor_employees
            SET is_active = false,
                status = 'INACTIVE',
                date_of_exit = COALESCE(date_of_exit, CURRENT_DATE),
                exit_reason = COALESCE($2, reason.reason, 'Deleted after branch approval'),
                updated_at = NOW()
           FROM (SELECT reason FROM approval_requests WHERE id = $3::uuid) reason
          WHERE contractor_employees.id = $1::uuid`,
        [req.contractor_employee_id, notes, requestId],
      );
      await mgr.query(
        `UPDATE approval_requests
            SET status = 'APPROVED',
                approver_user_id = $2,
                approver_notes = $3,
                approved_at = NOW(),
                updated_at = NOW()
          WHERE id = $1::uuid`,
        [requestId, reviewerUserId, notes],
      );
      return { ok: true as const, status: 'APPROVED' };
    });
  }

  private async findPendingDeleteRequest(
    contractorEmployeeId: string,
  ): Promise<{ id: string; status: string } | null> {
    const rows = await this.dataSource.query(
      `SELECT id::text, status
         FROM approval_requests
        WHERE request_type = 'DELETE_CONTRACTOR_EMPLOYEE'
          AND target_entity_type = 'CONTRACTOR_EMPLOYEE'
          AND target_entity_id = $1::uuid
          AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 1`,
      [contractorEmployeeId],
    );
    return rows?.[0] ?? null;
  }

  private async findLatestDeleteRequest(
    contractorEmployeeId: string,
  ): Promise<{ id: string; status: string } | null> {
    const rows = await this.dataSource.query(
      `SELECT id::text, status
         FROM approval_requests
        WHERE request_type = 'DELETE_CONTRACTOR_EMPLOYEE'
          AND target_entity_type = 'CONTRACTOR_EMPLOYEE'
          AND target_entity_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 1`,
      [contractorEmployeeId],
    );
    return rows?.[0] ?? null;
  }
}
