import {
  Injectable,
  Logger,
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
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { generateObservationsPdfBuffer } from './utils/observations-pdf';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class AuditorObservationsService {
  private readonly logger = new Logger(AuditorObservationsService.name);
  constructor(
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    @InjectRepository(AuditObservationCategoryEntity)
    private readonly categoryRepo: Repository<AuditObservationCategoryEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
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

  async listForAuditor(user: ReqUser, auditId?: string) {
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
    const clientIds = assignments.map((c: { id: string }) => c.id);

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

  async getOne(user: ReqUser, id: string) {
    const observation = await this.observationRepo.findOne({
      where: { id },
      relations: ['category', 'audit'],
    });

    if (!observation) throw new NotFoundException('Observation not found');

    await this.verifyAuditorAccess(user.userId, observation.auditId);

    return observation;
  }

  async create(
    user: ReqUser,
    dto: {
      auditId: string;
      categoryId?: string;
      observation: string;
      consequences?: string;
      complianceRequirements?: string;
      elaboration?: string;
      clause?: string;
      recommendation?: string;
      risk?: string;
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
      clause: dto.clause || null,
      recommendation: dto.recommendation || null,
      risk: dto.risk || null,
      status: 'OPEN',
      recordedByUserId: user.userId,
      evidenceFilePaths: dto.evidenceFilePaths
        ? JSON.stringify(dto.evidenceFilePaths)
        : null,
    });

    const saved = await this.observationRepo.save(observation);

    // Invalidate risk cache — fetch audit for branchId
    const audit = await this.auditRepo.findOne({ where: { id: dto.auditId } });
    if (audit?.branchId)
      this.riskCache
        .invalidateBranch(audit.branchId)
        .catch((e) =>
          this.logger.warn('Risk cache invalidation failed', e?.message),
        );

    return saved;
  }

  async update(
    user: ReqUser,
    id: string,
    dto: Partial<{
      observation: string;
      consequences: string | null;
      complianceRequirements: string | null;
      elaboration: string | null;
      clause: string | null;
      recommendation: string | null;
      risk: string | null;
      status: string;
      categoryId: string | null;
      evidenceFilePaths: string[];
    }>,
  ) {
    const observation = await this.getOne(user, id);

    if (dto.observation !== undefined)
      observation.observation = dto.observation;
    if (dto.consequences !== undefined)
      observation.consequences = dto.consequences;
    if (dto.complianceRequirements !== undefined)
      observation.complianceRequirements = dto.complianceRequirements;
    if (dto.elaboration !== undefined)
      observation.elaboration = dto.elaboration;
    if (dto.clause !== undefined) observation.clause = dto.clause;
    if (dto.recommendation !== undefined)
      observation.recommendation = dto.recommendation;
    if (dto.risk !== undefined) observation.risk = dto.risk;
    if (dto.status !== undefined) observation.status = dto.status;
    if (dto.categoryId !== undefined) observation.categoryId = dto.categoryId;
    if (dto.evidenceFilePaths !== undefined)
      observation.evidenceFilePaths = JSON.stringify(dto.evidenceFilePaths);

    const saved = await this.observationRepo.save(observation);

    // Invalidate risk cache — observation.audit is eager-loaded by getOne
    if (observation.audit?.branchId)
      this.riskCache
        .invalidateBranch(observation.audit.branchId)
        .catch((e) =>
          this.logger.warn('Risk cache invalidation failed', e?.message),
        );

    return saved;
  }

  async delete(user: ReqUser, id: string) {
    const observation = await this.getOne(user, id);
    const branchId = observation.audit?.branchId;
    await this.observationRepo.remove(observation);
    if (branchId)
      this.riskCache
        .invalidateBranch(branchId)
        .catch((e) =>
          this.logger.warn('Risk cache invalidation failed', e?.message),
        );
    return { message: 'Observation deleted successfully' };
  }

  async verifyClosure(user: ReqUser, id: string, remarks?: string) {
    const observation = await this.getOne(user, id);
    const currentStatus = String(observation.status || '').toUpperCase();
    if (!['RESOLVED', 'ACKNOWLEDGED'].includes(currentStatus)) {
      throw new BadRequestException(
        `Only RESOLVED or ACKNOWLEDGED observations can be verified. Current: ${currentStatus || 'OPEN'}`,
      );
    }

    observation.status = 'CLOSED';
    if (remarks?.trim()) {
      observation.elaboration = this.mergeRemarks(
        observation.elaboration,
        `Auditor verification: ${remarks.trim()}`,
      );
    }

    const saved = await this.observationRepo.save(observation);
    if (observation.audit?.branchId) {
      this.riskCache
        .invalidateBranch(observation.audit.branchId)
        .catch((e) =>
          this.logger.warn('Risk cache invalidation failed', e?.message),
        );
    }
    return saved;
  }

  async reopen(user: ReqUser, id: string, remarks?: string) {
    const observation = await this.getOne(user, id);
    const currentStatus = String(observation.status || '').toUpperCase();
    if (!['CLOSED', 'RESOLVED'].includes(currentStatus)) {
      throw new BadRequestException(
        `Only CLOSED or RESOLVED observations can be reopened. Current: ${currentStatus || 'OPEN'}`,
      );
    }

    observation.status = 'OPEN';
    if (remarks?.trim()) {
      observation.elaboration = this.mergeRemarks(
        observation.elaboration,
        `Auditor reopen note: ${remarks.trim()}`,
      );
    }

    const saved = await this.observationRepo.save(observation);
    if (observation.audit?.branchId) {
      this.riskCache
        .invalidateBranch(observation.audit.branchId)
        .catch((e) =>
          this.logger.warn('Risk cache invalidation failed', e?.message),
        );
    }
    return saved;
  }

  private mergeRemarks(existing: string | null, next: string): string {
    if (!existing?.trim()) return next;
    return `${existing}\n${next}`;
  }

  async exportPdf(user: ReqUser, auditId: string): Promise<Buffer> {
    await this.verifyAuditorAccess(user.userId, auditId);

    // Load client relation for name
    const auditWithClient = await this.auditRepo.findOne({
      where: { id: auditId },
      relations: ['client'],
    });

    const observations = await this.observationRepo.find({
      where: { auditId },
      relations: ['category'],
      order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
    });

    return generateObservationsPdfBuffer({
      auditId,
      clientName: auditWithClient?.client?.clientName ?? null,
      rows: observations.map((o) => ({
        sequenceNumber: o.sequenceNumber,
        observation: o.observation,
        consequences: o.consequences,
        complianceRequirements: o.complianceRequirements,
        clause: o.clause,
        elaboration: o.elaboration,
        recommendation: o.recommendation,
        risk: o.risk,
        status: o.status,
        categoryName: o.category?.name ?? null,
      })),
    });
  }
}
