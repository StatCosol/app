import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { FaceEnrollmentEntity } from './face-enrollment.entity';
import { ContractorFaceEnrollmentEntity } from './contractor-face-enrollment.entity';
import { KioskEnrollTicketEntity } from './kiosk-enroll-ticket.entity';
import { FaceEnrollmentHistoryEntity } from './enrollment-history.entity';
import { LivenessService } from '../liveness/liveness.service';
import { FacePhotoStorageService } from '../face/face-photo-storage.service';
import { FaceEmbeddingClient } from '../face/face-embedding.client';
import {
  averageEmbeddings,
  bufferToEmbedding,
  cosineSim,
  decodeEmbedding,
  embeddingToBuffer,
} from '../face/face-math';
import {
  CreateKioskTicketDto,
  DeactivateEnrollmentDto,
  SelfEnrollDto,
  SubmitKioskTicketDto,
} from './enrollment.dto';

const KIOSK_REQUIRED_FRAMES = Number(process.env.FACE_KIOSK_REQUIRED_FRAMES ?? 3);
const ESS_REQUIRED_FRAMES = Number(process.env.FACE_ESS_REQUIRED_FRAMES ?? 7);
const DUPLICATE_THRESHOLD = Number(process.env.FACE_DUPLICATE_THRESHOLD ?? 0.88);
const MIN_QUALITY = Number(process.env.FACE_MIN_QUALITY_SCORE ?? 0.75);
const TICKET_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(FaceEnrollmentEntity)
    private readonly enrollRepo: Repository<FaceEnrollmentEntity>,
    @InjectRepository(ContractorFaceEnrollmentEntity)
    private readonly contractorEnrollRepo: Repository<ContractorFaceEnrollmentEntity>,
    @InjectRepository(KioskEnrollTicketEntity)
    private readonly ticketRepo: Repository<KioskEnrollTicketEntity>,
    @InjectRepository(FaceEnrollmentHistoryEntity)
    private readonly historyRepo: Repository<FaceEnrollmentHistoryEntity>,
    private readonly livenessService: LivenessService,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly faceClient: FaceEmbeddingClient,
    private readonly dataSource: DataSource,
  ) {}

  // ─── ESS self-enroll ───────────────────────────────────────────────────────

  async enrollSelf(
    employeeId: string,
    clientId: string,
    branchId: string | null,
    dto: SelfEnrollDto,
    actorUserId: string,
  ): Promise<FaceEnrollmentEntity> {
    if (!dto.consentGiven) throw new BadRequestException('Consent required');
    if (dto.embeddingFrames.length < ESS_REQUIRED_FRAMES) {
      throw new BadRequestException(
        `ESS enrolment requires at least ${ESS_REQUIRED_FRAMES} frames`,
      );
    }

    const averaged = averageEmbeddings(dto.embeddingFrames.map(decodeEmbedding));
    await this.assertNotDuplicate(clientId, averaged, { excludeEmployeeId: employeeId });

    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage.uploadPhoto(dto.photoB64, clientId, employeeId);
    }

    if (this.faceClient.enabled && dto.photoB64) {
      const result = await this.faceClient.extractEmbedding(dto.photoB64);
      if (result.qualityScore < MIN_QUALITY) {
        throw new BadRequestException(
          `Photo quality too low (${result.qualityScore.toFixed(2)} < ${MIN_QUALITY})`,
        );
      }
    }

    return this.dataSource.transaction(async (em) => {
      const existing = await em.findOne(FaceEnrollmentEntity, { where: { employeeId } });
      const action = existing ? 'RE_ENROLL' : 'ENROLL';

      const record = em.create(FaceEnrollmentEntity, {
        employeeId,
        clientId,
        branchId,
        embedding: embeddingToBuffer(averaged),
        embeddingModel: dto.embeddingModel ?? null,
        photoUrl,
        consentGivenAt: new Date(),
        consentGivenBy: actorUserId,
        enrolledAt: new Date(),
        enrolledBy: actorUserId,
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
      });
      const saved = await em.save(FaceEnrollmentEntity, record);

      await em.save(FaceEnrollmentHistoryEntity, {
        employeeId,
        clientId,
        action,
        embeddingModel: dto.embeddingModel ?? null,
        actorUserId,
      });

      return saved;
    });
  }

  // ─── Kiosk ticket create ───────────────────────────────────────────────────

  async createKioskTicket(
    clientId: string,
    branchId: string | null,
    dto: CreateKioskTicketDto,
    createdBy: string,
  ): Promise<KioskEnrollTicketEntity> {
    // Cancel any existing PENDING ticket for the same device
    await this.ticketRepo.update(
      { deviceId: dto.deviceId, clientId, status: 'PENDING' },
      { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: createdBy },
    );

    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    const ticket = this.ticketRepo.create({
      clientId,
      branchId,
      deviceId: dto.deviceId,
      subjectType: dto.subjectType,
      employeeId: dto.employeeId ?? null,
      contractorEmployeeId: dto.contractorEmployeeId ?? null,
      subjectName: dto.subjectName,
      subjectCode: dto.subjectCode ?? null,
      createdBy,
      expiresAt,
      notes: dto.notes ?? null,
    });
    return this.ticketRepo.save(ticket);
  }

  // ─── Kiosk ticket submit ───────────────────────────────────────────────────

  async submitKioskTicket(
    deviceId: string,
    dto: SubmitKioskTicketDto,
    actorUserId: string,
  ): Promise<KioskEnrollTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: dto.ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'PENDING') {
      throw new BadRequestException(`Ticket is not PENDING (current: ${ticket.status})`);
    }
    if (ticket.expiresAt < new Date()) {
      throw new BadRequestException('Ticket has expired');
    }
    if (ticket.deviceId !== deviceId) {
      throw new BadRequestException('Ticket does not belong to this device');
    }
    if (!dto.consentGiven) throw new BadRequestException('Consent required');

    if (dto.embeddingFrames.length < KIOSK_REQUIRED_FRAMES) {
      throw new BadRequestException(
        `Kiosk enrolment requires at least ${KIOSK_REQUIRED_FRAMES} frames`,
      );
    }

    // Consume liveness nonce atomically before any write
    await this.livenessService.consumeNonce(deviceId, dto.livenessNonce, dto.livenessChallengeType);

    const averaged = averageEmbeddings(dto.embeddingFrames.map(decodeEmbedding));
    const embBuf = embeddingToBuffer(averaged);
    const { clientId, branchId, subjectType, employeeId, contractorEmployeeId } = ticket;

    // Quality gate via face-svc
    if (this.faceClient.enabled && dto.photoB64) {
      const res = await this.faceClient.extractEmbedding(dto.photoB64);
      if (res.qualityScore < MIN_QUALITY) {
        throw new BadRequestException(`Photo quality too low (${res.qualityScore.toFixed(2)})`);
      }
    }

    const excludeId =
      subjectType === 'EMPLOYEE' ? { excludeEmployeeId: employeeId ?? undefined } : {};
    await this.assertNotDuplicate(clientId, averaged, excludeId);

    let photoUrl: string | null = null;
    if (dto.photoB64 && (employeeId || contractorEmployeeId)) {
      const subId = (employeeId ?? contractorEmployeeId)!;
      photoUrl = await this.photoStorage.uploadPhoto(dto.photoB64, clientId, subId);
    }

    return this.dataSource.transaction(async (em) => {
      // Upsert enrollment
      if (subjectType === 'EMPLOYEE' && employeeId) {
        const existing = await em.findOne(FaceEnrollmentEntity, { where: { employeeId } });
        const action = existing ? 'RE_ENROLL' : 'ENROLL';
        await em.save(FaceEnrollmentEntity, {
          employeeId,
          clientId,
          branchId,
          embedding: embBuf,
          embeddingModel: dto.embeddingModel ?? null,
          photoUrl,
          consentGivenAt: new Date(),
          consentGivenBy: actorUserId,
          enrolledAt: new Date(),
          enrolledBy: actorUserId,
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
        });
        await em.save(FaceEnrollmentHistoryEntity, {
          employeeId, clientId, action, embeddingModel: dto.embeddingModel ?? null, actorUserId,
        });
      } else if (subjectType === 'CONTRACTOR' && contractorEmployeeId) {
        const existing = await em.findOne(ContractorFaceEnrollmentEntity, {
          where: { contractorEmployeeId },
        });
        const action = existing ? 'RE_ENROLL' : 'ENROLL';
        await em.save(ContractorFaceEnrollmentEntity, {
          contractorEmployeeId,
          clientId,
          branchId,
          embedding: embBuf,
          embeddingModel: dto.embeddingModel ?? null,
          photoUrl,
          consentGivenAt: new Date(),
          consentGivenBy: actorUserId,
          enrolledAt: new Date(),
          enrolledBy: actorUserId,
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
        });
        await em.save(FaceEnrollmentHistoryEntity, {
          contractorEmployeeId, clientId, action, embeddingModel: dto.embeddingModel ?? null, actorUserId,
        });
      }

      // Complete ticket — optimistic concurrency: only update PENDING
      const updateResult = await em
        .createQueryBuilder()
        .update(KioskEnrollTicketEntity)
        .set({
          status: 'COMPLETED',
          completedAt: new Date(),
          capturedAt: new Date(),
          pendingEmbedding: embBuf,
          photoUrl,
          embeddingModel: dto.embeddingModel ?? null,
          consentGiven: true,
        })
        .where('id = :id AND status = :status', { id: dto.ticketId, status: 'PENDING' })
        .returning('id')
        .execute();

      if (!updateResult.raw || updateResult.raw.length === 0) {
        throw new ConflictException('Ticket was already processed by another request');
      }

      const updated = await em.findOne(KioskEnrollTicketEntity, { where: { id: dto.ticketId } });
      return updated!;
    });
  }

  // ─── Deactivate enrollment ─────────────────────────────────────────────────

  async deactivateEnrollment(
    clientId: string,
    dto: DeactivateEnrollmentDto,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      if (dto.employeeId) {
        const rec = await em.findOne(FaceEnrollmentEntity, {
          where: { employeeId: dto.employeeId, clientId },
        });
        if (!rec) throw new NotFoundException('Enrollment not found');
        rec.isActive = false;
        rec.deactivatedAt = new Date();
        rec.deactivationReason = dto.reason ?? null;
        rec.embedding = Buffer.alloc(0); // DPDP crypto-shred
        await em.save(rec);
        await em.save(FaceEnrollmentHistoryEntity, {
          employeeId: dto.employeeId,
          clientId,
          action: 'DEACTIVATE',
          reason: dto.reason ?? null,
          actorUserId,
        });
      } else if (dto.contractorEmployeeId) {
        const rec = await em.findOne(ContractorFaceEnrollmentEntity, {
          where: { contractorEmployeeId: dto.contractorEmployeeId, clientId },
        });
        if (!rec) throw new NotFoundException('Contractor enrollment not found');
        rec.isActive = false;
        rec.deactivatedAt = new Date();
        rec.deactivationReason = dto.reason ?? null;
        rec.embedding = Buffer.alloc(0);
        await em.save(rec);
        await em.save(FaceEnrollmentHistoryEntity, {
          contractorEmployeeId: dto.contractorEmployeeId,
          clientId,
          action: 'DEACTIVATE',
          reason: dto.reason ?? null,
          actorUserId,
        });
      } else {
        throw new BadRequestException('Provide employeeId or contractorEmployeeId');
      }
    });
  }

  // ─── Duplicate check ───────────────────────────────────────────────────────

  async assertNotDuplicate(
    clientId: string,
    probe: Float32Array,
    opts: { excludeEmployeeId?: string; excludeContractorId?: string } = {},
  ): Promise<void> {
    const empEnrollments = await this.enrollRepo.find({
      where: { clientId, isActive: true },
      select: ['employeeId', 'embedding'],
    });
    const conEnrollments = await this.contractorEnrollRepo.find({
      where: { clientId, isActive: true },
      select: ['contractorEmployeeId', 'embedding'],
    });

    for (const e of empEnrollments) {
      if (opts.excludeEmployeeId && e.employeeId === opts.excludeEmployeeId) continue;
      if (!e.embedding || e.embedding.length === 0) continue;
      const existing = bufferToEmbedding(e.embedding);
      const sim = cosineSim(probe, existing);
      if (sim >= DUPLICATE_THRESHOLD) {
        throw new ConflictException(
          `Face too similar to existing employee enrollment (score ${sim.toFixed(3)})`,
        );
      }
    }

    for (const c of conEnrollments) {
      if (opts.excludeContractorId && c.contractorEmployeeId === opts.excludeContractorId) continue;
      if (!c.embedding || c.embedding.length === 0) continue;
      const existing = bufferToEmbedding(c.embedding);
      const sim = cosineSim(probe, existing);
      if (sim >= DUPLICATE_THRESHOLD) {
        throw new ConflictException(
          `Face too similar to existing contractor enrollment (score ${sim.toFixed(3)})`,
        );
      }
    }
  }

  async getEnrollment(clientId: string, employeeId: string): Promise<FaceEnrollmentEntity | null> {
    return this.enrollRepo.findOne({ where: { employeeId, clientId } });
  }

  async getContractorEnrollment(
    clientId: string,
    contractorEmployeeId: string,
  ): Promise<ContractorFaceEnrollmentEntity | null> {
    return this.contractorEnrollRepo.findOne({ where: { contractorEmployeeId, clientId } });
  }

  async getTicket(ticketId: string): Promise<KioskEnrollTicketEntity | null> {
    return this.ticketRepo.findOne({ where: { id: ticketId } });
  }

  async listTickets(
    clientId: string,
    status?: string,
  ): Promise<KioskEnrollTicketEntity[]> {
    const where: Record<string, unknown> = { clientId };
    if (status) where['status'] = status;
    return this.ticketRepo.find({ where, order: { createdAt: 'DESC' } });
  }
}
