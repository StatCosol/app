import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClraPeEstablishment } from './entities/clra-pe-establishment.entity';
import { ClraContractor } from './entities/clra-contractor.entity';
import { ClraContractorAssignment } from './entities/clra-contractor-assignment.entity';
import { ClraContractorWorker } from './entities/clra-contractor-worker.entity';
import { ClraWorkerDeployment } from './entities/clra-worker-deployment.entity';
import { ClraWagePeriod } from './entities/clra-wage-period.entity';
import { ClraAttendance } from './entities/clra-attendance.entity';
import { ClraWage } from './entities/clra-wage.entity';
import { ClraRegisterRun } from './entities/clra-register-run.entity';
import {
  CreateClraPeEstablishmentDto,
  CreateClraContractorDto,
  CreateClraAssignmentDto,
  CreateClraWorkerDto,
  CreateClraDeploymentDto,
  CreateClraWagePeriodDto,
  UpsertClraAttendanceDto,
  UpsertClraWageDto,
} from './clra-assignments.dto';

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

  async listPeEstablishments(clientId: string): Promise<ClraPeEstablishment[]> {
    return this.peRepo.find({
      where: { clientId, active: true },
      order: { establishmentName: 'ASC' },
    });
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

  async listContractors(): Promise<ClraContractor[]> {
    return this.contractorRepo.find({
      where: { active: true },
      order: { legalName: 'ASC' },
    });
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
  ): Promise<ClraContractorAssignment[]> {
    const where: any = {};
    if (contractorId) where.contractorId = contractorId;
    if (peEstablishmentId) where.peEstablishmentId = peEstablishmentId;
    return this.assignmentRepo.find({
      where,
      relations: ['contractor', 'peEstablishment'],
      order: { startDate: 'DESC' },
    });
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

  async listRegisterRuns(assignmentId: string): Promise<ClraRegisterRun[]> {
    return this.registerRunRepo.find({
      where: { assignmentId },
      order: { generatedAt: 'DESC' },
    });
  }
}
