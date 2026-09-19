import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { ClraPeEstablishment } from './entities/clra-pe-establishment.entity';
import { ClraContractor } from './entities/clra-contractor.entity';
import { ClraContractorAssignment } from './entities/clra-contractor-assignment.entity';
import { ClraContractorWorker } from './entities/clra-contractor-worker.entity';
import { ClraWorkerDeployment } from './entities/clra-worker-deployment.entity';
import { ClraWagePeriod } from './entities/clra-wage-period.entity';
import { ClraAttendance } from './entities/clra-attendance.entity';
import { ClraWage } from './entities/clra-wage.entity';
import { ClraRegisterRun } from './entities/clra-register-run.entity';
import type { ClraListScope } from './clra-access.service';
import {
  CreateClraPeEstablishmentDto,
  CreateClraContractorDto,
  CreateClraAssignmentDto,
  CreateClraWorkerDto,
  CreateClraDeploymentDto,
  CreateClraWagePeriodDto,
  UpsertClraAttendanceDto,
  UpsertClraWageDto,
  CreateClraRegisterRunDto,
} from './clra-assignments.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ClraAssignmentsService {
  constructor(
    @InjectRepository(ClraPeEstablishment)
    private readonly peRepo: Repository<ClraPeEstablishment>,

    @InjectRepository(ClraContractor)
    private readonly contractorRepo: Repository<ClraContractor>,

    @InjectRepository(ClraContractorAssignment)
    private readonly assignmentRepo: Repository<ClraContractorAssignment>,

    @InjectRepository(ClraContractorWorker)
    private readonly workerRepo: Repository<ClraContractorWorker>,

    @InjectRepository(ClraWorkerDeployment)
    private readonly deploymentRepo: Repository<ClraWorkerDeployment>,

    @InjectRepository(ClraWagePeriod)
    private readonly wagePeriodRepo: Repository<ClraWagePeriod>,

    @InjectRepository(ClraAttendance)
    private readonly attendanceRepo: Repository<ClraAttendance>,

    @InjectRepository(ClraWage)
    private readonly wageRepo: Repository<ClraWage>,

    @InjectRepository(ClraRegisterRun)
    private readonly registerRunRepo: Repository<ClraRegisterRun>,

    private readonly dataSource: DataSource,
  ) {}

  // ─────────────── PE Establishments ───────────────

  async createPeEstablishment(
    dto: CreateClraPeEstablishmentDto,
  ): Promise<ClraPeEstablishment> {
    const entity = this.peRepo.create({ ...dto });
    return this.peRepo.save(entity);
  }

  /**
   * `scope` limits the list to the caller's clients (see ClraAccessService).
   * Without it this was `where: { clientId }`, and TypeORM drops an undefined
   * value — so a caller who left clientId off got every company's PEs.
   */
  async listPeEstablishments(
    clientId?: string,
    scope?: ClraListScope,
  ): Promise<ClraPeEstablishment[]> {
    const qb = this.peRepo
      .createQueryBuilder('pe')
      .where('pe.active = true')
      .orderBy('pe.establishmentName', 'ASC');
    if (clientId) qb.andWhere('pe.clientId = :clientId', { clientId });
    if (scope && !applyPeScope(qb, 'pe', scope)) return [];
    return qb.getMany();
  }

  async getPeEstablishment(id: string): Promise<ClraPeEstablishment> {
    const entity = await this.peRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('PE establishment not found');
    return entity;
  }

  async updatePeEstablishment(
    id: string,
    dto: Partial<CreateClraPeEstablishmentDto>,
  ): Promise<ClraPeEstablishment> {
    await this.getPeEstablishment(id);
    await this.peRepo.update(id, dto as any);
    return this.getPeEstablishment(id);
  }

  // ─────────────── Contractors ───────────────

  async createContractor(
    dto: CreateClraContractorDto,
  ): Promise<ClraContractor> {
    const existing = await this.contractorRepo.findOne({
      where: { contractorCode: dto.contractorCode },
    });
    if (existing)
      throw new ConflictException(
        `Contractor code ${dto.contractorCode} already exists`,
      );
    const entity = this.contractorRepo.create({ ...dto });
    return this.contractorRepo.save(entity);
  }

  /**
   * Contractors belong to no single client, so with a scope they are the ones
   * assigned at one of the caller's PEs — plus, for staff who create
   * contractors before assigning them, those not assigned anywhere yet. This
   * listed every contractor of every company to any CLIENT user.
   */
  async listContractors(
    scope?: ClraListScope,
    includeUnassigned = false,
  ): Promise<ClraContractor[]> {
    const qb = this.contractorRepo
      .createQueryBuilder('c')
      .where('c.active = true')
      .orderBy('c.legalName', 'ASC');
    if (scope) {
      if (!scope.clientIds.length && !includeUnassigned) return [];
      const inScope = this.assignmentRepo
        .createQueryBuilder('a')
        .select('1')
        .innerJoin('a.peEstablishment', 'pe')
        .where('a.contractorId = c.id');
      const hasScope = applyPeScope(inScope, 'pe', scope);
      const clauses: string[] = [];
      if (hasScope) clauses.push(`EXISTS (${inScope.getQuery()})`);
      if (includeUnassigned)
        clauses.push(
          'NOT EXISTS (SELECT 1 FROM clra_contractor_assignments x WHERE x.contractor_id = c.id)',
        );
      if (!clauses.length) return [];
      qb.andWhere(`(${clauses.join(' OR ')})`).setParameters(
        inScope.getParameters(),
      );
    }
    return qb.getMany();
  }

  async getContractor(id: string): Promise<ClraContractor> {
    const entity = await this.contractorRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Contractor not found');
    return entity;
  }

  async updateContractor(
    id: string,
    dto: Partial<CreateClraContractorDto>,
  ): Promise<ClraContractor> {
    await this.getContractor(id);
    await this.contractorRepo.update(id, dto as any);
    return this.getContractor(id);
  }

  // ─────────────── Assignments ───────────────

  async createAssignment(
    dto: CreateClraAssignmentDto,
  ): Promise<ClraContractorAssignment> {
    const existing = await this.assignmentRepo.findOne({
      where: { assignmentCode: dto.assignmentCode },
    });
    if (existing)
      throw new ConflictException(
        `Assignment code ${dto.assignmentCode} already exists`,
      );
    const entity = this.assignmentRepo.create({ ...dto });
    return this.assignmentRepo.save(entity);
  }

  async listAssignments(
    contractorId?: string,
    peEstablishmentId?: string,
    scope?: ClraListScope,
  ): Promise<ClraContractorAssignment[]> {
    const qb = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.contractor', 'contractor')
      .leftJoinAndSelect('a.peEstablishment', 'pe')
      .orderBy('a.startDate', 'DESC');
    if (contractorId)
      qb.andWhere('a.contractorId = :contractorId', { contractorId });
    if (peEstablishmentId)
      qb.andWhere('a.peEstablishmentId = :peEstablishmentId', {
        peEstablishmentId,
      });
    // With no filter and no scope this returned every assignment of every company.
    if (scope && !applyPeScope(qb, 'pe', scope)) return [];
    return qb.getMany();
  }

  async getAssignment(id: string): Promise<ClraContractorAssignment> {
    const entity = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['contractor', 'peEstablishment'],
    });
    if (!entity) throw new NotFoundException('Assignment not found');
    return entity;
  }

  async updateAssignment(
    id: string,
    dto: Partial<CreateClraAssignmentDto>,
  ): Promise<ClraContractorAssignment> {
    await this.getAssignment(id);
    await this.assignmentRepo.update(id, dto as any);
    return this.getAssignment(id);
  }

  // ─────────────── Workers ───────────────

  async createWorker(dto: CreateClraWorkerDto): Promise<ClraContractorWorker> {
    const existing = await this.workerRepo.findOne({
      where: { contractorId: dto.contractorId, workerCode: dto.workerCode },
    });
    if (existing)
      throw new ConflictException(
        `Worker code ${dto.workerCode} already exists for this contractor`,
      );
    const entity = this.workerRepo.create({ ...dto });
    return this.workerRepo.save(entity);
  }

  async listWorkers(contractorId: string): Promise<ClraContractorWorker[]> {
    return this.workerRepo.find({
      where: { contractorId, active: true },
      order: { fullName: 'ASC' },
    });
  }

  async getWorker(id: string): Promise<ClraContractorWorker> {
    const entity = await this.workerRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Worker not found');
    return entity;
  }

  async updateWorker(
    id: string,
    dto: Partial<CreateClraWorkerDto>,
  ): Promise<ClraContractorWorker> {
    await this.getWorker(id);
    await this.workerRepo.update(id, dto as any);
    return this.getWorker(id);
  }

  // ─────────────── Deployments ───────────────

  async createDeployment(
    dto: CreateClraDeploymentDto,
  ): Promise<ClraWorkerDeployment> {
    const entity = this.deploymentRepo.create({ ...dto });
    return this.deploymentRepo.save(entity);
  }

  async listDeployments(assignmentId: string): Promise<ClraWorkerDeployment[]> {
    return this.deploymentRepo.find({
      where: { assignmentId },
      relations: ['worker'],
      order: { deploymentStart: 'ASC' },
    });
  }

  async getDeployment(id: string): Promise<ClraWorkerDeployment> {
    const entity = await this.deploymentRepo.findOne({
      where: { id },
      relations: ['worker', 'assignment'],
    });
    if (!entity) throw new NotFoundException('Deployment not found');
    return entity;
  }

  async updateDeployment(
    id: string,
    dto: Partial<CreateClraDeploymentDto>,
  ): Promise<ClraWorkerDeployment> {
    await this.getDeployment(id);
    await this.deploymentRepo.update(id, dto as any);
    return this.getDeployment(id);
  }

  // ─────────────── Wage Periods ───────────────

  async createWagePeriod(
    dto: CreateClraWagePeriodDto,
  ): Promise<ClraWagePeriod> {
    const entity = this.wagePeriodRepo.create({ ...dto });
    return this.wagePeriodRepo.save(entity);
  }

  async listWagePeriods(assignmentId: string): Promise<ClraWagePeriod[]> {
    return this.wagePeriodRepo.find({
      where: { assignmentId },
      order: { periodFrom: 'DESC' },
    });
  }

  async getWagePeriod(id: string): Promise<ClraWagePeriod> {
    const entity = await this.wagePeriodRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Wage period not found');
    return entity;
  }

  async closeWagePeriod(id: string): Promise<ClraWagePeriod> {
    await this.getWagePeriod(id);
    await this.wagePeriodRepo.update(id, { status: 'CLOSED' });
    return this.getWagePeriod(id);
  }

  // ─────────────── Attendance ───────────────

  async upsertAttendance(
    dto: UpsertClraAttendanceDto,
  ): Promise<ClraAttendance> {
    const existing = await this.attendanceRepo.findOne({
      where: {
        workerDeploymentId: dto.workerDeploymentId,
        attendanceDate: dto.attendanceDate,
      },
    });
    if (existing) {
      await this.attendanceRepo.update(existing.id, { ...dto } as any);
      return this.attendanceRepo.findOne({
        where: { id: existing.id },
      }) as Promise<ClraAttendance>;
    }
    const entity = this.attendanceRepo.create({ ...dto });
    return this.attendanceRepo.save(entity);
  }

  async listAttendance(wagePeriodId: string): Promise<ClraAttendance[]> {
    return this.attendanceRepo.find({
      where: { wagePeriodId },
      relations: ['workerDeployment', 'workerDeployment.worker'],
      order: { attendanceDate: 'ASC' },
    });
  }

  // ─────────────── Wages ───────────────

  async upsertWage(dto: UpsertClraWageDto): Promise<ClraWage> {
    const existing = await this.wageRepo.findOne({
      where: {
        wagePeriodId: dto.wagePeriodId,
        workerDeploymentId: dto.workerDeploymentId,
      },
    });
    if (existing) {
      await this.wageRepo.update(existing.id, { ...dto } as any);
      return this.wageRepo.findOne({
        where: { id: existing.id },
      }) as Promise<ClraWage>;
    }
    const entity = this.wageRepo.create({ ...dto });
    return this.wageRepo.save(entity);
  }

  async listWages(wagePeriodId: string): Promise<ClraWage[]> {
    return this.wageRepo.find({
      where: { wagePeriodId },
      relations: ['workerDeployment', 'workerDeployment.worker'],
      order: { workerDeploymentId: 'ASC' },
    });
  }

  // ─────────────── Register Runs ───────────────

  async createRegisterRun(
    assignmentId: string,
    registerCode: string,
    wagePeriodId: string | null,
    userId: string,
    fileName: string,
    fileUrl: string,
  ): Promise<ClraRegisterRun> {
    const entity = this.registerRunRepo.create({
      assignmentId,
      wagePeriodId,
      registerCode,
      fileName,
      fileUrl,
      generatedByUserId: userId,
      status: 'GENERATED',
    });
    return this.registerRunRepo.save(entity);
  }

  createRegisterRunFromUpload(
    dto: CreateClraRegisterRunDto,
    file: Express.Multer.File,
    userId: string,
  ): Promise<ClraRegisterRun> {
    if (!file?.path) throw new BadRequestException('File upload failed');
    const fileUrl = file.path.replace(/\\/g, '/');
    return this.createRegisterRun(
      dto.assignmentId,
      dto.registerCode,
      dto.wagePeriodId ?? null,
      userId,
      file.originalname,
      fileUrl,
    );
  }

  async downloadRegisterRun(id: string): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }> {
    const row = await this.registerRunRepo.findOne({ where: { id } });
    if (!row?.fileUrl)
      throw new NotFoundException('Register run or file not found');
    const resolved = path.isAbsolute(row.fileUrl)
      ? row.fileUrl
      : path.resolve(process.cwd(), row.fileUrl);
    if (!fs.existsSync(resolved)) {
      throw new NotFoundException('Register file missing on disk');
    }
    const buffer = fs.readFileSync(resolved);
    const fileName = row.fileName || path.basename(resolved);
    const ext = path.extname(fileName).toLowerCase();
    const mimeType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/octet-stream';
    return { buffer, fileName, mimeType };
  }

  async listRegisterRuns(assignmentId: string): Promise<ClraRegisterRun[]> {
    return this.registerRunRepo.find({
      where: { assignmentId },
      order: { generatedAt: 'DESC' },
    });
  }

  async getRegisterRun(id: string): Promise<ClraRegisterRun> {
    const row = await this.registerRunRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Register run not found');
    return row;
  }

  // ─────────────── Contractor portal (scoped) ───────────────

  async findContractorForUser(
    userId: string,
    email?: string | null,
  ): Promise<ClraContractor> {
    let entity = await this.contractorRepo.findOne({
      where: { contractorUserId: userId, active: true },
    });
    if (!entity && email) {
      entity = await this.contractorRepo.findOne({
        where: { email: ILike(email.trim()), active: true },
      });
      if (entity && !entity.contractorUserId) {
        await this.contractorRepo.update(entity.id, {
          contractorUserId: userId,
        });
        entity.contractorUserId = userId;
      }
    }
    if (!entity) {
      throw new NotFoundException(
        'CLRA contractor profile is not linked to your account. Contact your CRM team.',
      );
    }
    return entity;
  }

  async assertAssignmentBelongsToContractor(
    assignmentId: string,
    contractorId: string,
  ): Promise<ClraContractorAssignment> {
    const assignment = await this.getAssignment(assignmentId);
    if (assignment.contractorId !== contractorId) {
      throw new ForbiddenException(
        'Assignment does not belong to this contractor',
      );
    }
    return assignment;
  }

  async assertWorkerBelongsToContractor(
    workerId: string,
    contractorId: string,
  ): Promise<ClraContractorWorker> {
    const worker = await this.getWorker(workerId);
    if (worker.contractorId !== contractorId) {
      throw new ForbiddenException('Worker does not belong to this contractor');
    }
    return worker;
  }

  async assertDeploymentBelongsToContractor(
    deploymentId: string,
    contractorId: string,
  ): Promise<ClraWorkerDeployment> {
    const deployment = await this.getDeployment(deploymentId);
    const assignment = await this.getAssignment(deployment.assignmentId);
    if (assignment.contractorId !== contractorId) {
      throw new ForbiddenException(
        'Deployment does not belong to this contractor',
      );
    }
    return deployment;
  }

  async assertWagePeriodBelongsToContractor(
    wagePeriodId: string,
    contractorId: string,
  ): Promise<ClraWagePeriod> {
    const period = await this.getWagePeriod(wagePeriodId);
    await this.assertAssignmentBelongsToContractor(
      period.assignmentId,
      contractorId,
    );
    return period;
  }
}

/**
 * Narrow a query to PEs in `scope`. Returns false when the scope is empty, so
 * the caller can answer with nothing instead of running an unfiltered query.
 * A PE with no branch is company-wide and visible to the company's branch users.
 */
function applyPeScope(
  qb: { andWhere: (sql: string, params?: object) => unknown },
  alias: string,
  scope: NonNullable<ClraListScope>,
): boolean {
  if (!scope.clientIds.length) return false;
  qb.andWhere(`${alias}.clientId IN (:...clraScopeClients)`, {
    clraScopeClients: scope.clientIds,
  });
  if (scope.branchIds) {
    if (!scope.branchIds.length) {
      qb.andWhere(`${alias}.branchId IS NULL`);
    } else {
      qb.andWhere(
        `(${alias}.branchId IS NULL OR ${alias}.branchId IN (:...clraScopeBranches))`,
        { clraScopeBranches: scope.branchIds },
      );
    }
  }
  return true;
}
