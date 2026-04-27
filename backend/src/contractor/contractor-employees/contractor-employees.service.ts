import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorEmployeeEntity } from './entities/contractor-employee.entity';

@Injectable()
export class ContractorEmployeesService {
  constructor(
    @InjectRepository(ContractorEmployeeEntity)
    private readonly repo: Repository<ContractorEmployeeEntity>,
  ) {}

  async create(
    clientId: string,
    branchId: string,
    contractorUserId: string,
    dto: Partial<ContractorEmployeeEntity>,
  ): Promise<ContractorEmployeeEntity> {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    const emp = this.repo.create({
      ...dto,
      clientId,
      branchId,
      contractorUserId,
      name: dto.name.trim(),
      isActive: true,
    });
    return this.repo.save(emp);
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
    Object.assign(emp, dto);
    return this.repo.save(emp);
  }

  async deactivate(
    id: string,
    contractorUserId: string,
    exitReason?: string,
  ): Promise<ContractorEmployeeEntity> {
    const emp = await this.findById(id, contractorUserId);
    emp.isActive = false;
    emp.dateOfExit = new Date().toISOString().split('T')[0];
    emp.exitReason = exitReason || null;
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
