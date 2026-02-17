import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditObservationCategoryEntity } from './entities/audit-observation-category.entity';
import { AuditEntity } from './entities/audit.entity';
import { AssignmentsService } from '../assignments/assignments.service';

@Injectable()
export class AuditorObservationsService {
  constructor(
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    @InjectRepository(AuditObservationCategoryEntity)
    private readonly categoryRepo: Repository<AuditObservationCategoryEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async listCategories() {
    return this.categoryRepo.find({ order: { name: 'ASC' } });
  }

  private async verifyAuditorAccess(auditorUserId: string, auditId: string) {
    const audit = await this.auditRepo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    // Verify auditor is assigned to the client
    const assignment = await this.assignmentsService.isClientAssignedToAuditor(
      audit.clientId,
      auditorUserId,
    );
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this audit');
    }

    return audit;
  }

  async listForAuditor(user: any, auditId?: string) {
    if (auditId) {
      await this.verifyAuditorAccess(user.userId, auditId);
      const observations = await this.observationRepo.find({
        where: { auditId },
        relations: ['category'],
        order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
      });
      return observations;
    }

    // Get all audits assigned to this auditor
    const assignments =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignments.map((c: any) => c.id);

    if (clientIds.length === 0) return [];

    const audits = await this.auditRepo.find({
      where: clientIds.map((clientId) => ({ clientId })),
    });
    const auditIds = audits.map((a) => a.id);

    if (auditIds.length === 0) return [];

    return this.observationRepo.find({
      where: auditIds.map((id) => ({ auditId: id })),
      relations: ['category', 'audit'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOne(user: any, id: string) {
    const observation = await this.observationRepo.findOne({
      where: { id },
      relations: ['category', 'audit'],
    });

    if (!observation) throw new NotFoundException('Observation not found');

    await this.verifyAuditorAccess(user.userId, observation.auditId);

    return observation;
  }

  async create(
    user: any,
    dto: {
      auditId: string;
      categoryId?: string;
      observation: string;
      consequences?: string;
      complianceRequirements?: string;
      elaboration?: string;
      evidenceFilePaths?: string[];
    },
  ) {
    if (!dto.observation) {
      throw new BadRequestException('Observation text is required');
    }

    await this.verifyAuditorAccess(user.userId, dto.auditId);

    // Get next sequence number
    const lastObs = await this.observationRepo.findOne({
      where: { auditId: dto.auditId },
      order: { sequenceNumber: 'DESC' },
    });
    const sequenceNumber = (lastObs?.sequenceNumber || 0) + 1;

    const observation = this.observationRepo.create({
      auditId: dto.auditId,
      categoryId: dto.categoryId || null,
      sequenceNumber,
      observation: dto.observation,
      consequences: dto.consequences || null,
      complianceRequirements: dto.complianceRequirements || null,
      elaboration: dto.elaboration || null,
      status: 'OPEN',
      recordedByUserId: user.userId,
      evidenceFilePaths: dto.evidenceFilePaths
        ? JSON.stringify(dto.evidenceFilePaths)
        : null,
    });

    return this.observationRepo.save(observation);
  }

  async update(user: any, id: string, dto: any) {
    const observation = await this.getOne(user, id);

    if (dto.observation !== undefined)
      observation.observation = dto.observation;
    if (dto.consequences !== undefined)
      observation.consequences = dto.consequences;
    if (dto.complianceRequirements !== undefined)
      observation.complianceRequirements = dto.complianceRequirements;
    if (dto.elaboration !== undefined)
      observation.elaboration = dto.elaboration;
    if (dto.status !== undefined) observation.status = dto.status;
    if (dto.categoryId !== undefined) observation.categoryId = dto.categoryId;
    if (dto.evidenceFilePaths !== undefined)
      observation.evidenceFilePaths = JSON.stringify(dto.evidenceFilePaths);

    return this.observationRepo.save(observation);
  }

  async delete(user: any, id: string) {
    const observation = await this.getOne(user, id);
    await this.observationRepo.remove(observation);
    return { message: 'Observation deleted successfully' };
  }
}
