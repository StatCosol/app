import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AppraisalCycleEntity } from '../entities/appraisal-cycle.entity';
import { AppraisalCycleScopeEntity } from '../entities/appraisal-cycle-scope.entity';
import { EmployeeAppraisalEntity } from '../entities/employee-appraisal.entity';
import { EmployeeAppraisalItemEntity } from '../entities/employee-appraisal-item.entity';
import { AppraisalTemplateItemEntity } from '../entities/appraisal-template-item.entity';
import { CreateAppraisalCycleDto, UpdateAppraisalCycleDto } from '../dto/appraisal-cycle.dto';
import { CycleStatus } from '../enums/appraisal.enums';

@Injectable()
export class AppraisalCyclesService {
  constructor(
    @InjectRepository(AppraisalCycleEntity)
    private readonly cycleRepo: Repository<AppraisalCycleEntity>,
    @InjectRepository(AppraisalCycleScopeEntity)
    private readonly scopeRepo: Repository<AppraisalCycleScopeEntity>,
    @InjectRepository(EmployeeAppraisalEntity)
    private readonly appraisalRepo: Repository<EmployeeAppraisalEntity>,
    @InjectRepository(EmployeeAppraisalItemEntity)
    private readonly appraisalItemRepo: Repository<EmployeeAppraisalItemEntity>,
    @InjectRepository(AppraisalTemplateItemEntity)
    private readonly templateItemRepo: Repository<AppraisalTemplateItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(clientId: string, dto: CreateAppraisalCycleDto, userId: string) {
    const cycle = this.cycleRepo.create({
      clientId,
      cycleCode: dto.cycleCode,
      cycleName: dto.cycleName,
      financialYear: dto.financialYear,
      appraisalType: dto.appraisalType,
      reviewPeriodFrom: dto.reviewPeriodFrom,
      reviewPeriodTo: dto.reviewPeriodTo,
      effectiveDate: dto.effectiveDate ?? null,
      templateId: dto.templateId ?? null,
      status: CycleStatus.DRAFT,
      createdBy: userId,
    });
    const saved = await this.cycleRepo.save(cycle);

    if (dto.scopes?.length) {
      const scopes = dto.scopes.map(s => this.scopeRepo.create({
        cycleId: saved.id,
        branchId: s.branchId ?? null,
        departmentId: s.departmentId ?? null,
        designationId: s.designationId ?? null,
        employmentType: s.employmentType ?? null,
      }));
      await this.scopeRepo.save(scopes);
    }

    return saved;
  }

  async findAll(clientId: string, branchId?: string) {
    const qb = this.cycleRepo.createQueryBuilder('c')
      .where('c.client_id = :clientId', { clientId })
      .orderBy('c.created_at', 'DESC');

    const cycles = await qb.getMany();

    // Attach counts
    const result: any[] = [];
    for (const cycle of cycles) {
      const [{ total, completed, pending }] = await this.dataSource.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS completed,
           COUNT(*) FILTER (WHERE status NOT IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS pending
         FROM employee_appraisals WHERE cycle_id = $1`,
        [cycle.id],
      );
      result.push({ ...cycle, eligibleCount: total, completedCount: completed, pendingCount: pending });
    }
    return result;
  }

  async findOne(id: string) {
    const cycle = await this.cycleRepo.findOne({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');

    const scopes = await this.scopeRepo.find({ where: { cycleId: id } });
    return { ...cycle, scopes };
  }

  async update(id: string, dto: UpdateAppraisalCycleDto) {
    const cycle = await this.cycleRepo.findOne({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status === CycleStatus.CLOSED) throw new BadRequestException('Cannot modify closed cycle');

    Object.assign(cycle, dto);
    return this.cycleRepo.save(cycle);
  }

  async activate(id: string) {
    const cycle = await this.cycleRepo.findOne({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== CycleStatus.DRAFT) throw new BadRequestException('Only draft cycles can be activated');

    cycle.status = CycleStatus.ACTIVE;
    return this.cycleRepo.save(cycle);
  }

  async close(id: string) {
    const cycle = await this.cycleRepo.findOne({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');

    cycle.status = CycleStatus.CLOSED;
    return this.cycleRepo.save(cycle);
  }

  async generateEmployees(id: string) {
    const cycle = await this.cycleRepo.findOne({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status === CycleStatus.CLOSED) throw new BadRequestException('Cycle is closed');

    const scopes = await this.scopeRepo.find({ where: { cycleId: id, isActive: true } });

    let query = `
      SELECT id, client_id, branch_id, employee_code, name, department_id, designation_id
      FROM employees
      WHERE client_id = $1 AND is_active = true AND date_of_exit IS NULL
    `;
    const params: any[] = [cycle.clientId];

    // Filter by scope branches if specified
    const branchIds = scopes.map(s => s.branchId).filter(Boolean);
    if (branchIds.length) {
      query += ` AND branch_id = ANY($${params.length + 1})`;
      params.push(branchIds);
    }

    const deptIds = scopes.map(s => s.departmentId).filter(Boolean);
    if (deptIds.length) {
      query += ` AND department_id = ANY($${params.length + 1})`;
      params.push(deptIds);
    }

    const desigIds = scopes.map(s => s.designationId).filter(Boolean);
    if (desigIds.length) {
      query += ` AND designation_id = ANY($${params.length + 1})`;
      params.push(desigIds);
    }

    const employees: any[] = await this.dataSource.query(query, params);

    // Get template items if template is set
    let templateItems: AppraisalTemplateItemEntity[] = [];
    if (cycle.templateId) {
      templateItems = await this.templateItemRepo.find({
        where: { templateId: cycle.templateId, isActive: true },
        order: { sequence: 'ASC' },
      });
    }

    let created = 0;
    for (const emp of employees) {
      // Skip if already exists
      const exists = await this.appraisalRepo.findOne({
        where: { cycleId: id, employeeId: emp.id },
      });
      if (exists) continue;

      const appraisal = await this.appraisalRepo.save({
        clientId: cycle.clientId,
        branchId: emp.branch_id,
        employeeId: emp.id,
        cycleId: id,
        templateId: cycle.templateId,
        status: 'INITIATED',
        createdBy: cycle.createdBy,
      });

      // Pre-populate items from template
      if (templateItems.length) {
        const items = templateItems.map(ti => this.appraisalItemRepo.create({
          employeeAppraisalId: appraisal.id,
          sectionId: ti.sectionId,
          templateItemId: ti.id,
          itemName: ti.itemName,
          weightage: ti.weightage,
          sequence: ti.sequence,
        }));
        await this.appraisalItemRepo.save(items);
      }

      created++;
    }

    return { generated: created, total: employees.length, alreadyExisted: employees.length - created };
  }
}
