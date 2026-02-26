import {
  Injectable,
  BadRequestException,
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

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(EmployeeSequenceEntity)
    private readonly seqRepo: Repository<EmployeeSequenceEntity>,
    @InjectRepository(EmployeeNominationEntity)
    private readonly nomRepo: Repository<EmployeeNominationEntity>,
    @InjectRepository(EmployeeNominationMemberEntity)
    private readonly nomMemberRepo: Repository<EmployeeNominationMemberEntity>,
    @InjectRepository(EmployeeGeneratedFormEntity)
    private readonly formRepo: Repository<EmployeeGeneratedFormEntity>,
    private readonly ds: DataSource,
    private readonly riskCache: AiRiskCacheInvalidatorService,
  ) {}

  // ── Employee Code Generator ────────────────────────────────
  // Format: <STATE>-<BR>-<YYYY>-<SEQ padded to 4>
  async generateEmployeeCode(
    clientId: string,
    stateCode: string,
    branchCode: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const st = (stateCode || 'XX').toUpperCase().substring(0, 2);
    const br = (branchCode || '00').toUpperCase().substring(0, 4);

    // Atomic upsert: INSERT ... ON CONFLICT ... UPDATE lastSeq = lastSeq + 1
    const result = await this.ds.query(
      `INSERT INTO employee_sequence (id, client_id, state_code, branch_code, year, last_seq)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
       ON CONFLICT (client_id, state_code, branch_code, year)
       DO UPDATE SET last_seq = employee_sequence.last_seq + 1
       RETURNING last_seq`,
      [clientId, st, br, year],
    );
    const seq = result[0]?.last_seq || 1;
    return `${st}-${br}-${year}-${String(seq).padStart(4, '0')}`;
  }

  // ── CRUD ───────────────────────────────────────────────────

  async create(
    clientId: string,
    branchId: string | null,
    dto: Partial<EmployeeEntity> & { stateCode?: string; branchCode?: string },
  ): Promise<EmployeeEntity> {
    // Wrap code generation + save in a transaction so sequence is not wasted on failure
    return this.ds.transaction(async (manager) => {
      const year = new Date().getFullYear();
      const st = (dto.stateCode || 'XX').toUpperCase().substring(0, 2);
      const br = (dto.branchCode || '00').toUpperCase().substring(0, 4);

      const result = await manager.query(
        `INSERT INTO employee_sequence (id, client_id, state_code, branch_code, year, last_seq)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
         ON CONFLICT (client_id, state_code, branch_code, year)
         DO UPDATE SET last_seq = employee_sequence.last_seq + 1
         RETURNING last_seq`,
        [clientId, st, br, year],
      );
      const seq = result[0]?.last_seq || 1;
      const code = `${st}-${br}-${year}-${String(seq).padStart(4, '0')}`;

      const emp = manager.create(EmployeeEntity, {
        ...dto,
        clientId,
        branchId: branchId || dto.branchId || null,
        employeeCode: code,
      });
      return manager.save(emp);
    });
  }

  async list(
    clientId: string,
    filters: {
      branchId?: string;
      branchIds?: string[];
      isActive?: boolean;
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
      qb.andWhere('e.branchId IN (:...branchIds)', { branchIds: filters.branchIds });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('e.isActive = :isActive', { isActive: filters.isActive });
    }
    if (filters.search) {
      qb.andWhere(
        '(LOWER(e.firstName) LIKE :s OR LOWER(e.lastName) LIKE :s OR e.employeeCode LIKE :s)',
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
    dto: Partial<EmployeeEntity>,
  ): Promise<EmployeeEntity> {
    const emp = await this.findById(clientId, id);
    Object.assign(emp, dto);
    const saved = await this.empRepo.save(emp);
    if (saved.branchId) this.riskCache.invalidateBranch(saved.branchId).catch(() => {});
    return saved;
  }

  async deactivate(clientId: string, id: string): Promise<EmployeeEntity> {
    const emp = await this.findById(clientId, id);
    emp.isActive = false;
    emp.dateOfExit = new Date().toISOString().split('T')[0];
    const deactivated = await this.empRepo.save(emp);
    if (deactivated.branchId) this.riskCache.invalidateBranch(deactivated.branchId).catch(() => {});
    return deactivated;
  }

  // ── Nominations ────────────────────────────────────────────

  async createNomination(
    employeeId: string,
    dto: Partial<EmployeeNominationEntity> & {
      members?: Partial<EmployeeNominationMemberEntity>[];
    },
  ) {
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
        this.nomMemberRepo.create({ ...m, nominationId: saved.id }),
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

    const result: any[] = [];
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
  ): Promise<EmployeeGeneratedFormEntity> {
    const form = this.formRepo.create({
      employeeId,
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
