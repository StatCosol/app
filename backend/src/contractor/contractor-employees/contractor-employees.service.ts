import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorEmployeeEntity } from './entities/contractor-employee.entity';
import { MinimumWageService } from './minimum-wage.service';
import { UserEntity } from '../../users/entities/user.entity';

const SKILL_CATEGORIES = [
  'UNSKILLED',
  'SEMI_SKILLED',
  'SKILLED',
  'HIGHLY_SKILLED',
] as const;
type SkillCategory = (typeof SKILL_CATEGORIES)[number];

const STATUSES = ['ACTIVE', 'LEFT', 'INACTIVE'] as const;
type EmployeeStatus = (typeof STATUSES)[number];

function normalizeSkill(value: any): SkillCategory | null {
  if (value == null || value === '') return null;
  const v = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
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
  ) {}

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
  private prepare(dto: Partial<ContractorEmployeeEntity> & Record<string, any>) {
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
    return out;
  }

  async create(
    clientId: string,
    branchId: string,
    contractorUserId: string,
    dto: Partial<ContractorEmployeeEntity>,
  ): Promise<ContractorEmployeeEntity> {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
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
      throw new BadRequestException('Bulk upload limited to 1000 rows per request');
    }

    const results: BulkRowResult[] = [];
    let created = 0;
    let failed = 0;

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
}
