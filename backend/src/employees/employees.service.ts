import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { EmployeeSequenceEntity } from './entities/employee-sequence.entity';
import { EmployeeNominationEntity } from './entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from './entities/employee-nomination-member.entity';
import { EmployeeGeneratedFormEntity } from './entities/employee-generated-form.entity';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import type {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateEmployeeNominationDto,
} from './dto/employees.dto';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(EmployeeSequenceEntity)
    private readonly _seqRepo: Repository<EmployeeSequenceEntity>,
    @InjectRepository(EmployeeNominationEntity)
    private readonly nomRepo: Repository<EmployeeNominationEntity>,
    @InjectRepository(EmployeeNominationMemberEntity)
    private readonly nomMemberRepo: Repository<EmployeeNominationMemberEntity>,
    @InjectRepository(EmployeeGeneratedFormEntity)
    private readonly formRepo: Repository<EmployeeGeneratedFormEntity>,
    private readonly ds: DataSource,
    private readonly riskCache: AiRiskCacheInvalidatorService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Returns true only if the value looks like a real UAN/ESIC number
   * (i.e. is numeric or at least mostly digits). Rejects text like
   * "Not applicable", "NA", "N/A", "NIL", etc.
   */
  static isValidRegistrationNumber(val: string | null | undefined): boolean {
    if (!val) return false;
    const trimmed = val.trim();
    if (!trimmed) return false;
    // Strip hyphens/spaces that sometimes appear in formatted numbers
    const digits = trimmed.replace(/[\s-]/g, '');
    // Must be at least 4 digits and entirely numeric
    return /^\d{4,}$/.test(digits);
  }

  /**
   * Sanitize UAN/ESIC: if the value is not a valid number, return null.
   */
  static sanitizeRegNumber(val: string | null | undefined): string | null {
    if (!val) return null;
    const trimmed = val.trim();
    if (!EmployeesService.isValidRegistrationNumber(trimmed)) return null;
    return trimmed;
  }

  // ── Employee Code Generator ────────────────────────────────
  // Format: <CLIENT_SHORT><BRANCH_SHORT><SEQ padded to 4>
  // Example: LMSHYD0001  (LMS from "LMSPL", HYD from "HYD-001")

  /**
   * Extract a short alphabetic prefix from a code.
   * "LMSPL" → "LMS" (first 3 alpha chars)
   * "HYD-001" → "HYD" (alpha prefix before dash/digit)
   */
  private shortPrefix(code: string, maxLen = 3): string {
    const alpha = code.replace(/[^A-Z]/gi, '').toUpperCase();
    return alpha.substring(0, maxLen) || 'XX';
  }

  async generateEmployeeCode(
    clientId: string,
    _stateCode: string,
    _branchCode: string,
    branchId?: string | null,
  ): Promise<string> {
    // Look up client code (e.g. "LMSPL" → short "LMS")
    const clientRows = await this.ds.query(
      `SELECT client_code FROM clients WHERE id = $1`,
      [clientId],
    );
    const clientShort = this.shortPrefix(clientRows[0]?.client_code || '', 3);

    // Look up branch code (e.g. "HYD-001" → short "HYD")
    let brShort = 'XX';
    if (branchId) {
      const brRows = await this.ds.query(
        `SELECT branch_code FROM client_branches WHERE id = $1`,
        [branchId],
      );
      brShort = this.shortPrefix(brRows[0]?.branch_code || '', 3);
    }

    const prefix = `${clientShort}${brShort}`;

    // Atomic upsert: sequence per client-short + branch-short (no year)
    const year = new Date().getFullYear();
    const result = await this.ds.query(
      `INSERT INTO employee_sequence (id, client_id, state_code, branch_code, year, last_seq)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
       ON CONFLICT (client_id, state_code, branch_code, year)
       DO UPDATE SET last_seq = employee_sequence.last_seq + 1
       RETURNING last_seq`,
      [clientId, clientShort, brShort, year],
    );
    const seq = result[0]?.last_seq || 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  // ── CRUD ───────────────────────────────────────────────────

  async create(
    clientId: string,
    branchId: string | null,
    dto: CreateEmployeeDto & { stateCode?: string; branchCode?: string },
    isBranchUser = false,
    skipStrictValidation = false,
  ): Promise<EmployeeEntity> {
    // Validate mandatory fields (skipped for bulk import)
    if (!skipStrictValidation) {
      if (!dto.phone?.trim())
        throw new BadRequestException('Phone number is required');
      if (!dto.aadhaar?.trim())
        throw new BadRequestException('Aadhaar number is required');
    }

    // Age advisory check (non-blocking, validation is done on frontend)
    // Previously was a hard block for < 18; now handled as a frontend warning only.

    // Check for duplicate phone within this client
    const phoneNorm = dto.phone?.replace(/\s+/g, '') || null;
    if (phoneNorm) {
      const existingByPhone = await this.empRepo.findOne({
        where: { clientId, phone: phoneNorm },
      });
      if (existingByPhone) {
        throw new BadRequestException(
          `An employee with phone ${phoneNorm} already exists (${existingByPhone.name} - ${existingByPhone.employeeCode})`,
        );
      }
    }

    // Check for duplicate Aadhaar within this client
    const aadhaarNorm = dto.aadhaar?.replace(/\s+/g, '') || null;
    if (aadhaarNorm) {
      const existingByAadhaar = await this.empRepo.findOne({
        where: { clientId, aadhaar: aadhaarNorm },
      });
      if (existingByAadhaar) {
        throw new BadRequestException(
          `An employee with Aadhaar ${aadhaarNorm} already exists (${existingByAadhaar.name} - ${existingByAadhaar.employeeCode})`,
        );
      }
    }

    // Normalize before saving
    dto.phone = phoneNorm || undefined;
    dto.aadhaar = aadhaarNorm || undefined;

    // Wrap code generation + save in a transaction so sequence is not wasted on failure
    return this.ds.transaction(async (manager) => {
      // Look up client code (e.g. "LMSPL" → short "LMS")
      const clientRows = await manager.query(
        `SELECT client_code FROM clients WHERE id = $1`,
        [clientId],
      );
      const clientShort = this.shortPrefix(clientRows[0]?.client_code || '', 3);

      // Look up branch code (e.g. "HYD-001" → short "HYD")
      const effectiveBranchId = branchId || dto.branchId || null;
      let brShort = 'XX';
      if (effectiveBranchId) {
        const brRows = await manager.query(
          `SELECT branch_code FROM client_branches WHERE id = $1`,
          [effectiveBranchId],
        );
        brShort = this.shortPrefix(brRows[0]?.branch_code || '', 3);
      }

      const prefix = `${clientShort}${brShort}`;
      const year = new Date().getFullYear();

      const result = await manager.query(
        `INSERT INTO employee_sequence (id, client_id, state_code, branch_code, year, last_seq)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
         ON CONFLICT (client_id, state_code, branch_code, year)
         DO UPDATE SET last_seq = employee_sequence.last_seq + 1
         RETURNING last_seq`,
        [clientId, clientShort, brShort, year],
      );
      const seq = result[0]?.last_seq || 1;
      const code = `${prefix}${String(seq).padStart(4, '0')}`;

      const emp = manager.create(EmployeeEntity, {
        ...dto,
        clientId,
        branchId: effectiveBranchId,
        employeeCode: code,
        approvalStatus: isBranchUser ? 'PENDING' : 'APPROVED',
      });

      // Sanitize UAN/ESIC — reject text like "Not applicable"
      emp.uan = EmployeesService.sanitizeRegNumber(emp.uan);
      emp.esic = EmployeesService.sanitizeRegNumber(emp.esic);

      // Auto-set registration flags when valid numbers are present
      if (emp.uan) { emp.pfApplicable = true; emp.pfRegistered = true; }
      if (emp.esic) { emp.esiApplicable = true; emp.esiRegistered = true; }

      return manager.save(emp);
    });
  }

  async list(
    clientId: string,
    filters: {
      branchId?: string;
      branchIds?: string[];
      isActive?: boolean;
      approvalStatus?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const qb = this.empRepo
      .createQueryBuilder('e')
      .where('e.clientId = :clientId', { clientId });

    if (filters.branchId) {
      qb.andWhere('e.branchId = :branchId', { branchId: filters.branchId });
    } else if (filters.branchIds?.length) {
      qb.andWhere('e.branchId IN (:...branchIds)', {
        branchIds: filters.branchIds,
      });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('e.isActive = :isActive', { isActive: filters.isActive });
    }
    if (filters.approvalStatus) {
      qb.andWhere('e.approvalStatus = :approvalStatus', {
        approvalStatus: filters.approvalStatus,
      });
    }
    if (filters.search) {
      qb.andWhere(
        '(LOWER(e.name) LIKE :s OR e.employeeCode LIKE :s)',
        { s: `%${filters.search.toLowerCase()}%` },
      );
    }
    qb.orderBy('e.createdAt', 'DESC');
    qb.take(filters.limit || 100);
    qb.skip(filters.offset || 0);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(clientId: string, id: string): Promise<EmployeeEntity> {
    const emp = await this.empRepo.findOne({ where: { id, clientId } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async update(
    clientId: string,
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeEntity> {
    const emp = await this.findById(clientId, id);

    // Validate & check duplicate phone if changed
    if (dto.phone !== undefined) {
      const phoneNorm = (dto.phone || '').replace(/\s+/g, '');
      if (!phoneNorm) throw new BadRequestException('Phone number is required');
      if (phoneNorm !== emp.phone) {
        const dup = await this.empRepo.findOne({
          where: { clientId, phone: phoneNorm },
        });
        if (dup && dup.id !== id) {
          throw new BadRequestException(
            `An employee with phone ${phoneNorm} already exists (${dup.name} - ${dup.employeeCode})`,
          );
        }
      }
      dto.phone = phoneNorm;
    }

    // Validate & check duplicate Aadhaar if changed
    if (dto.aadhaar !== undefined) {
      const aadhaarNorm = (dto.aadhaar || '').replace(/\s+/g, '');
      if (!aadhaarNorm)
        throw new BadRequestException('Aadhaar number is required');
      if (aadhaarNorm !== emp.aadhaar) {
        const dup = await this.empRepo.findOne({
          where: { clientId, aadhaar: aadhaarNorm },
        });
        if (dup && dup.id !== id) {
          throw new BadRequestException(
            `An employee with Aadhaar ${aadhaarNorm} already exists (${dup.name} - ${dup.employeeCode})`,
          );
        }
      }
      dto.aadhaar = aadhaarNorm;
    }

    // Strip read-only fields the frontend may send
    const { id: _id, clientId: _cid, employeeCode: _ec, ...safeDto } = dto as any;
    Object.assign(emp, safeDto);

    // Sanitize UAN/ESIC — reject text like "Not applicable"
    emp.uan = EmployeesService.sanitizeRegNumber(emp.uan);
    emp.esic = EmployeesService.sanitizeRegNumber(emp.esic);

    // Auto-set registration flags when valid numbers are present
    if (emp.uan) { emp.pfApplicable = true; emp.pfRegistered = true; }
    if (emp.esic) { emp.esiApplicable = true; emp.esiRegistered = true; }

    const saved = await this.empRepo.save(emp);
    if (saved.branchId)
      this.riskCache
        .invalidateBranch(saved.branchId)
        .catch((e) =>
          this.logger.warn('riskCache invalidation failed', e?.message),
        );
    return saved;
  }

  async hardDelete(clientId: string, id: string): Promise<void> {
    const emp = await this.findById(clientId, id);
    await this.ds.transaction(async (mgr) => {
      // Delete from all child tables that reference employee_id
      await mgr.query(`DELETE FROM employee_nomination_members WHERE nomination_id IN (SELECT id FROM employee_nominations WHERE employee_id = $1)`, [id]);
      await mgr.query(`DELETE FROM employee_nominations WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM employee_generated_forms WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM employee_documents WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM employee_statutory WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM employee_salary_revisions WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM attendance_records WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM leave_ledger WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM leave_balances WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM leave_applications WHERE employee_id = $1`, [id]);
      // Payroll child tables
      await mgr.query(`DELETE FROM payroll_run_component_values WHERE run_employee_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = $1)`, [id]);
      await mgr.query(`DELETE FROM payroll_run_items WHERE run_employee_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = $1)`, [id]);
      await mgr.query(`DELETE FROM pay_calc_traces WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM payroll_run_employees WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM payroll_fnf WHERE employee_id = $1`, [id]);
      // Nullable FK tables — set null instead of delete
      await mgr.query(`UPDATE pay_salary_structures SET employee_id = NULL WHERE employee_id = $1`, [id]);
      await mgr.query(`UPDATE payroll_queries SET employee_id = NULL WHERE employee_id = $1`, [id]);
      await mgr.query(`UPDATE ai_payroll_anomalies SET employee_id = NULL WHERE employee_id = $1`, [id]);
      await mgr.query(`UPDATE users SET employee_id = NULL WHERE employee_id = $1`, [id]);
      // Finally delete the employee
      await mgr.query(`DELETE FROM employees WHERE id = $1 AND client_id = $2`, [id, clientId]);
    });
    if (emp.branchId) {
      this.riskCache.invalidateBranch(emp.branchId).catch((e) =>
        this.logger.warn('riskCache invalidation failed', e?.message),
      );
    }
  }

  async deactivate(clientId: string, id: string, exitReason?: string, dateOfExit?: string): Promise<EmployeeEntity> {
    const emp = await this.findById(clientId, id);
    emp.isActive = false;
    emp.dateOfExit = dateOfExit || new Date().toISOString().split('T')[0];
    emp.exitReason = exitReason || null;
    const deactivated = await this.empRepo.save(emp);
    if (deactivated.branchId)
      this.riskCache
        .invalidateBranch(deactivated.branchId)
        .catch((e) =>
          this.logger.warn('riskCache invalidation failed', e?.message),
        );
    return deactivated;
  }

  async approveEmployee(clientId: string, id: string): Promise<EmployeeEntity> {
    const emp = await this.findById(clientId, id);
    if (emp.approvalStatus === 'APPROVED') {
      throw new BadRequestException('Employee is already approved');
    }
    emp.approvalStatus = 'APPROVED';
    return this.empRepo.save(emp);
  }

  async rejectEmployee(clientId: string, id: string): Promise<EmployeeEntity> {
    const emp = await this.findById(clientId, id);
    if (emp.approvalStatus === 'REJECTED') {
      throw new BadRequestException('Employee is already rejected');
    }
    emp.approvalStatus = 'REJECTED';
    emp.isActive = false;
    return this.empRepo.save(emp);
  }

  // ── Nominations ────────────────────────────────────────────

  async createNomination(
    employeeId: string,
    dto: CreateEmployeeNominationDto & {
      members?: Partial<EmployeeNominationMemberEntity>[];
    },
  ) {
    if (!dto.nominationType) {
      throw new BadRequestException('nominationType is required');
    }
    const declarationDate = this.normalizeDate(dto.declarationDate);
    const witnessName = this.normalizeText(dto.witnessName);
    const witnessAddress = this.normalizeText(dto.witnessAddress);

    const nom = this.nomRepo.create({
      ...dto,
      employeeId,
      declarationDate,
      witnessName,
      witnessAddress,
    });
    const saved = await this.nomRepo.save(nom);

    if (dto.members?.length) {
      const members = dto.members.map((m) =>
        this.nomMemberRepo.create({
          ...m,
          nominationId: saved.id,
        } as Partial<EmployeeNominationMemberEntity>),
      );
      await this.nomMemberRepo.save(members);
    }
    return saved;
  }

  private normalizeDate(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('Invalid declarationDate');
    }
    return new Date(parsed).toISOString().split('T')[0];
  }

  private normalizeText(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  }

  async listNominations(employeeId: string) {
    const nominations = await this.nomRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });

    const result: Array<Record<string, unknown>> = [];
    for (const nom of nominations) {
      const members = await this.nomMemberRepo.find({
        where: { nominationId: nom.id },
        order: { createdAt: 'ASC' },
      });
      result.push({ ...nom, members });
    }
    return result;
  }

  async deleteNomination(nominationId: string) {
    // Members cascade-deleted via FK
    await this.nomRepo.delete(nominationId);
  }

  // ── Generated Forms ────────────────────────────────────────

  async saveGeneratedForm(
    employeeId: string,
    formType: string,
    fileName: string,
    filePath: string,
    fileSize: number,
    generatedBy: string,
    clientId?: string,
    branchId?: string | null,
  ): Promise<EmployeeGeneratedFormEntity> {
    const form = this.formRepo.create({
      employeeId,
      clientId,
      branchId: branchId ?? null,
      formType,
      fileName,
      filePath,
      fileSize: String(fileSize),
      generatedBy,
    });
    return this.formRepo.save(form);
  }

  async listGeneratedForms(employeeId: string) {
    return this.formRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }
}
