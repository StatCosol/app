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

const KIOSK_REQUIRED_FRAMES = Number(
  process.env.FACE_KIOSK_REQUIRED_FRAMES ?? 3,
);
const ESS_REQUIRED_FRAMES = Number(process.env.FACE_ESS_REQUIRED_FRAMES ?? 7);
// Keep duplicate enrollment blocking at least as strict as punch matching.
// MobileFaceNet same-person scores commonly land below 0.88, so a higher
// duplicate threshold allows one face to be enrolled against multiple people.
const DEFAULT_DUPLICATE_THRESHOLD = Number(
  process.env.FACE_MIN_MATCH_SCORE ?? 0.72,
);
const DUPLICATE_THRESHOLD = Number(
  process.env.FACE_DUPLICATE_THRESHOLD ?? DEFAULT_DUPLICATE_THRESHOLD,
);
const MIN_QUALITY = Number(process.env.FACE_MIN_QUALITY_SCORE ?? 0.75);
const DEFAULT_KIOSK_TICKET_TTL_MS = 5 * 60 * 1000;
const KIOSK_TICKET_TTL_MS = Number(
  process.env.FACE_KIOSK_TICKET_TTL_MS ?? DEFAULT_KIOSK_TICKET_TTL_MS,
);

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

  private assertEnrollmentBranchAllowed(
    branchId: string | null | undefined,
    allowedBranchIds: string[] | null,
  ): void {
    if (!allowedBranchIds) return;
    if (!branchId || !allowedBranchIds.includes(branchId)) {
      throw new NotFoundException('Enrollment not found');
    }
  }

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

    const averaged = averageEmbeddings(
      dto.embeddingFrames.map(decodeEmbedding),
    );
    await this.assertNotDuplicate(clientId, averaged, {
      excludeEmployeeId: employeeId,
    });

    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage.uploadPhoto(
        dto.photoB64,
        clientId,
        employeeId,
      );
    }

    if (this.faceClient.enabled && dto.photoB64) {
      const result = await this.faceClient.extractEmbedding(dto.photoB64);
      if (result !== null && result.qualityScore < MIN_QUALITY) {
        throw new BadRequestException(
          `Photo quality too low (${result.qualityScore.toFixed(2)} < ${MIN_QUALITY})`,
        );
      }
    }

    return this.dataSource.transaction(async (em) => {
      const existing = await em.findOne(FaceEnrollmentEntity, {
        where: { employeeId },
      });
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
    allowedBranchIds: string[] | null = null,
  ): Promise<KioskEnrollTicketEntity> {
    const [device] = await this.dataSource.query<
      Array<{ id: string; branchId: string | null }>
    >(
      `SELECT d.id,
              COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') AS "branchId"
         FROM mobile_attendance_devices d
        WHERE d.id = $1::uuid
          AND COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') = $2
          AND COALESCE(to_jsonb(d)->>'mode', 'KIOSK') = 'KIOSK'
          AND COALESCE((to_jsonb(d)->>'isActive')::boolean, (to_jsonb(d)->>'is_active')::boolean, true) = true
        LIMIT 1`,
      [dto.deviceId, clientId],
    );
    if (!device) {
      throw new BadRequestException(
        'Selected kiosk device is not active for this client',
      );
    }
    if (
      allowedBranchIds &&
      (!device.branchId || !allowedBranchIds.includes(device.branchId))
    ) {
      throw new BadRequestException(
        'Selected kiosk device is not active for your branch',
      );
    }
    const ticketBranchId = device.branchId ?? branchId;

    // Cancel any existing PENDING ticket for the same device
    await this.ticketRepo.update(
      { deviceId: dto.deviceId, clientId, status: 'PENDING' },
      { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: createdBy },
    );

    const expiresAt = new Date(Date.now() + KIOSK_TICKET_TTL_MS);
    const ticket = this.ticketRepo.create({
      clientId,
      branchId: ticketBranchId,
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
  ): Promise<KioskEnrollTicketEntity> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: dto.ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'PENDING') {
      throw new BadRequestException(
        `Ticket is not PENDING (current: ${ticket.status})`,
      );
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

    const livenessChallengeType =
      dto.livenessChallengeType ?? dto.challengeType ?? null;

    // Consume liveness nonce atomically before any write
    await this.livenessService.consumeNonce(
      deviceId,
      dto.livenessNonce,
      livenessChallengeType,
    );

    const averaged = averageEmbeddings(
      dto.embeddingFrames.map(decodeEmbedding),
    );
    const embBuf = embeddingToBuffer(averaged);
    const {
      clientId,
      branchId,
      subjectType,
      employeeId,
      contractorEmployeeId,
    } = ticket;
    const actorUserId = ticket.createdBy ?? null;

    // Quality gate via face-svc
    if (this.faceClient.enabled && dto.photoB64) {
      const res = await this.faceClient.extractEmbedding(dto.photoB64);
      if (res !== null && res.qualityScore < MIN_QUALITY) {
        throw new BadRequestException(
          `Photo quality too low (${res.qualityScore.toFixed(2)})`,
        );
      }
    }

    const excludeId =
      subjectType === 'EMPLOYEE'
        ? { excludeEmployeeId: employeeId ?? undefined }
        : { excludeContractorId: contractorEmployeeId ?? undefined };
    await this.assertNotDuplicate(clientId, averaged, excludeId);

    let photoUrl: string | null = null;
    if (dto.photoB64 && (employeeId || contractorEmployeeId)) {
      const subId = (employeeId ?? contractorEmployeeId)!;
      photoUrl = await this.photoStorage.uploadPhoto(
        dto.photoB64,
        clientId,
        subId,
      );
    }

    return this.dataSource.transaction(async (em) => {
      // Upsert enrollment
      if (subjectType === 'EMPLOYEE' && employeeId) {
        const existing = await em.findOne(FaceEnrollmentEntity, {
          where: { employeeId },
        });
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
          employeeId,
          clientId,
          action,
          embeddingModel: dto.embeddingModel ?? null,
          actorUserId,
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
          contractorEmployeeId,
          clientId,
          action,
          embeddingModel: dto.embeddingModel ?? null,
          actorUserId,
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
        .where('id = :id AND status = :status', {
          id: dto.ticketId,
          status: 'PENDING',
        })
        .returning('id')
        .execute();

      if (!updateResult.raw || updateResult.raw.length === 0) {
        throw new ConflictException(
          'Ticket was already processed by another request',
        );
      }

      const updated = await em.findOne(KioskEnrollTicketEntity, {
        where: { id: dto.ticketId },
      });
      return updated!;
    });
  }

  // ─── Deactivate enrollment ─────────────────────────────────────────────────

  async deactivateEnrollment(
    clientId: string,
    dto: DeactivateEnrollmentDto,
    actorUserId: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<
    | { ok: true; deactivated: true; employeeId: string }
    | { ok: true; deactivated: true; contractorEmployeeId: string }
    | { ok: true; deleted: true; employeeId: string }
    | { ok: true; deleted: true; contractorEmployeeId: string }
  > {
    const employeeId =
      dto.employeeId ??
      (dto.subjectType === 'EMPLOYEE' ? dto.subjectId : undefined);
    const contractorEmployeeId =
      dto.contractorEmployeeId ??
      (dto.subjectType === 'CONTRACTOR' ? dto.subjectId : undefined);

    if (dto.subjectId && !dto.subjectType) {
      throw new BadRequestException('subjectType is required with subjectId');
    }
    if (employeeId && contractorEmployeeId) {
      throw new BadRequestException(
        'Provide only one of employeeId or contractorEmployeeId',
      );
    }
    if (!employeeId && !contractorEmployeeId) {
      throw new BadRequestException(
        'Provide employeeId or contractorEmployeeId',
      );
    }

    await this.dataSource.transaction(async (em) => {
      if (employeeId) {
        const rec = await em.findOne(FaceEnrollmentEntity, {
          where: { employeeId, clientId },
        });
        if (!rec) throw new NotFoundException('Enrollment not found');
        this.assertEnrollmentBranchAllowed(rec.branchId, allowedBranchIds);
        await em.save(FaceEnrollmentHistoryEntity, {
          employeeId,
          clientId,
          action: dto.permanent ? 'DELETE' : 'DEACTIVATE',
          reason: dto.reason ?? null,
          actorUserId,
        });
        if (dto.permanent) {
          await em.delete(FaceEnrollmentEntity, { employeeId, clientId });
          return;
        }
        rec.isActive = false;
        rec.deactivatedAt = new Date();
        rec.deactivationReason = dto.reason ?? null;
        rec.embedding = Buffer.alloc(0); // DPDP crypto-shred
        await em.save(rec);
      } else if (contractorEmployeeId) {
        const rec = await em.findOne(ContractorFaceEnrollmentEntity, {
          where: { contractorEmployeeId, clientId },
        });
        if (!rec)
          throw new NotFoundException('Contractor enrollment not found');
        this.assertEnrollmentBranchAllowed(rec.branchId, allowedBranchIds);
        await em.save(FaceEnrollmentHistoryEntity, {
          contractorEmployeeId,
          clientId,
          action: dto.permanent ? 'DELETE' : 'DEACTIVATE',
          reason: dto.reason ?? null,
          actorUserId,
        });
        if (dto.permanent) {
          await em.delete(ContractorFaceEnrollmentEntity, {
            contractorEmployeeId,
            clientId,
          });
          return;
        }
        rec.isActive = false;
        rec.deactivatedAt = new Date();
        rec.deactivationReason = dto.reason ?? null;
        rec.embedding = Buffer.alloc(0);
        await em.save(rec);
      }
    });

    if (employeeId) {
      return dto.permanent
        ? { ok: true, deleted: true, employeeId }
        : { ok: true, deactivated: true, employeeId };
    }
    return dto.permanent
      ? { ok: true, deleted: true, contractorEmployeeId: contractorEmployeeId! }
      : {
          ok: true,
          deactivated: true,
          contractorEmployeeId: contractorEmployeeId!,
        };
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
      if (opts.excludeEmployeeId && e.employeeId === opts.excludeEmployeeId)
        continue;
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
      if (
        opts.excludeContractorId &&
        c.contractorEmployeeId === opts.excludeContractorId
      )
        continue;
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

  async getEnrollment(
    clientId: string,
    employeeId: string,
  ): Promise<FaceEnrollmentEntity | null> {
    return this.enrollRepo.findOne({ where: { employeeId, clientId } });
  }

  async getContractorEnrollment(
    clientId: string,
    contractorEmployeeId: string,
  ): Promise<ContractorFaceEnrollmentEntity | null> {
    return this.contractorEnrollRepo.findOne({
      where: { contractorEmployeeId, clientId },
    });
  }

  async getTicket(
    ticketId: string,
    clientId: string,
  ): Promise<KioskEnrollTicketEntity | null> {
    return this.ticketRepo.findOne({ where: { id: ticketId, clientId } });
  }

  async listTickets(
    clientId: string,
    status?: string,
  ): Promise<KioskEnrollTicketEntity[]> {
    const where: Record<string, unknown> = { clientId };
    if (status) where['status'] = status;
    return this.ticketRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getPendingTicketForDevice(
    deviceId: string,
  ): Promise<KioskEnrollTicketEntity | null> {
    await this.ticketRepo
      .createQueryBuilder()
      .update(KioskEnrollTicketEntity)
      .set({ status: 'EXPIRED' })
      .where('device_id = :deviceId', { deviceId })
      .andWhere('status = :status', { status: 'PENDING' })
      .andWhere('expires_at <= now()')
      .execute();

    return this.ticketRepo
      .createQueryBuilder('ticket')
      .where('ticket.deviceId = :deviceId', { deviceId })
      .andWhere('ticket.status = :status', { status: 'PENDING' })
      .andWhere('ticket.expiresAt > now()')
      .orderBy('ticket.createdAt', 'ASC')
      .getOne();
  }

  // ─── Admin list endpoints ──────────────────────────────────────────────────

  async listEmployeeEnrollments(
    clientId: string,
    branchIds: string[] = [],
  ): Promise<any[]> {
    const params: unknown[] = [clientId];
    let employeeBranchFilter = '';
    let enrollmentBranchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      employeeBranchFilter = ` AND e.branch_id = ANY($${params.length}::uuid[])`;
      enrollmentBranchFilter = ` AND fe.branch_id = ANY($${params.length}::uuid[])`;
    }

    return this.dataSource.query(
      `SELECT e.id AS "employeeId",
              scoped.branch_id AS "branchId",
              fe.embedding_model AS "embeddingModel",
              fe.photo_url AS "photoUrl",
              fe.enrolled_at AS "enrolledAt",
              COALESCE(fe.is_active, false) AS "isActive",
              fe.employee_id IS NOT NULL AS "isEnrolled",
              fe.deactivated_at AS "deactivatedAt",
              fe.deactivation_reason AS "deactivationReason",
              e.employee_code AS "employeeCode",
              e.name AS "employeeName"
       FROM (
         SELECT e.id AS employee_id, e.branch_id
         FROM employees e
         WHERE e.client_id = $1
           AND e.is_active = TRUE
           ${employeeBranchFilter}
         UNION
         SELECT fe.employee_id, fe.branch_id
         FROM face_enrollments fe
         WHERE fe.client_id = $1
           ${enrollmentBranchFilter}
       ) scoped
       JOIN employees e
         ON e.id = scoped.employee_id
        AND e.client_id = $1
       LEFT JOIN face_enrollments fe
         ON fe.employee_id = scoped.employee_id
        AND fe.client_id = e.client_id
        AND fe.branch_id IS NOT DISTINCT FROM scoped.branch_id
       ORDER BY COALESCE(fe.enrolled_at, TIMESTAMPTZ 'epoch') DESC,
                e.employee_code ASC`,
      params,
    );
  }

  async listContractorEnrollments(
    clientId: string,
    branchIds: string[] = [],
  ): Promise<any[]> {
    const params: unknown[] = [clientId];
    let contractorBranchFilter = '';
    let enrollmentBranchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      contractorBranchFilter = ` AND ce.branch_id = ANY($${params.length}::uuid[])`;
      enrollmentBranchFilter = ` AND cfe.branch_id = ANY($${params.length}::uuid[])`;
    }

    return this.dataSource.query(
      `SELECT ce.id AS "contractorEmployeeId",
              scoped.branch_id AS "branchId",
              ce.contractor_user_id AS "contractorUserId",
              cfe.embedding_model AS "embeddingModel",
              cfe.photo_url AS "photoUrl",
              cfe.enrolled_at AS "enrolledAt",
              COALESCE(cfe.is_active, false) AS "isActive",
              cfe.contractor_employee_id IS NOT NULL AS "isEnrolled",
              cfe.deactivated_at AS "deactivatedAt",
              cfe.deactivation_reason AS "deactivationReason",
              ce.name AS "name"
       FROM (
         SELECT ce.id AS contractor_employee_id, ce.branch_id
         FROM contractor_employees ce
         WHERE ce.client_id = $1
           AND ce.is_active = TRUE
           ${contractorBranchFilter}
         UNION
         SELECT cfe.contractor_employee_id, cfe.branch_id
         FROM contractor_face_enrollments cfe
         WHERE cfe.client_id = $1
           ${enrollmentBranchFilter}
       ) scoped
       JOIN contractor_employees ce
         ON ce.id = scoped.contractor_employee_id
        AND ce.client_id = $1
       LEFT JOIN contractor_face_enrollments cfe
         ON cfe.contractor_employee_id = scoped.contractor_employee_id
        AND cfe.client_id = ce.client_id
        AND cfe.branch_id IS NOT DISTINCT FROM scoped.branch_id
       ORDER BY COALESCE(cfe.enrolled_at, TIMESTAMPTZ 'epoch') DESC,
                ce.name ASC`,
      params,
    );
  }

  async cancelKioskTicket(
    clientId: string,
    ticketId: string,
    cancelledBy: string,
  ): Promise<{ ok: true }> {
    const result = await this.ticketRepo
      .createQueryBuilder()
      .update(KioskEnrollTicketEntity)
      .set({ status: 'CANCELLED', cancelledAt: new Date(), cancelledBy })
      .where(
        'id = :ticketId AND client_id = :clientId AND status IN (:...statuses)',
        { ticketId, clientId, statuses: ['PENDING', 'REVIEW_PENDING'] },
      )
      .execute();

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Ticket not found or not cancellable');
    }
    return { ok: true };
  }
}
