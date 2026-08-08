import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FacePhotoStorageService } from '../face/face-photo-storage.service';
import { FaceTemplateService } from '../face/face-template.service';
import { bufferToEmbedding } from '../face/face-math';
import { FaceEnrollmentEntity } from './face-enrollment.entity';
import { ContractorFaceEnrollmentEntity } from './contractor-face-enrollment.entity';
import { FaceEnrollmentHistoryEntity } from './enrollment-history.entity';
import {
  FaceReenrollmentRequestEntity,
  ReenrollRequestSource,
  ReenrollRequestStatus,
} from './face-reenrollment-request.entity';
import { ContractorFaceReenrollmentRequestEntity } from './contractor-face-reenrollment-request.entity';

export interface ReenrollRequestRow {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string | null;
  branchId: string | null;
  requestedBy: string | null;
  requestedAt: string;
  reason: string | null;
  photoUrl: string | null;
  source: ReenrollRequestSource;
  status: ReenrollRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface ContractorReenrollRequestRow {
  id: string;
  contractorEmployeeId: string;
  contractorName: string | null;
  branchId: string | null;
  requestedBy: string | null;
  requestedAt: string;
  reason: string | null;
  photoUrl: string | null;
  source: ReenrollRequestSource;
  status: ReenrollRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

@Injectable()
export class ReenrollmentService {
  constructor(
    @InjectRepository(FaceReenrollmentRequestEntity)
    private readonly empReqRepo: Repository<FaceReenrollmentRequestEntity>,
    @InjectRepository(ContractorFaceReenrollmentRequestEntity)
    private readonly conReqRepo: Repository<ContractorFaceReenrollmentRequestEntity>,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly templateService: FaceTemplateService,
    private readonly dataSource: DataSource,
  ) {}

  async createEmployeeRequest(args: {
    clientId: string;
    branchId: string | null;
    employeeId: string;
    actorUserId: string;
    source: ReenrollRequestSource;
    embedding: Buffer;
    embeddingModel: string | null;
    photoUrl: string | null;
    reason?: string | null;
  }): Promise<{ status: 'PENDING_REVIEW'; requestId: string; message: string }> {
    const saved = await this.dataSource.transaction(async (em) => {
      await em.update(
        FaceReenrollmentRequestEntity,
        { employeeId: args.employeeId, status: 'PENDING' },
        {
          status: 'CANCELLED',
          reviewedAt: new Date(),
          reviewNotes: 'Superseded by newer request',
        },
      );
      return em.save(FaceReenrollmentRequestEntity, {
        clientId: args.clientId,
        branchId: args.branchId,
        employeeId: args.employeeId,
        requestedBy: args.actorUserId,
        requestedAt: new Date(),
        reason: args.reason ?? null,
        photoUrl: args.photoUrl,
        pendingEmbedding: args.embedding,
        embeddingModel: args.embeddingModel,
        source: args.source,
        status: 'PENDING',
      });
    });

    return {
      status: 'PENDING_REVIEW',
      requestId: saved.id,
      message:
        'Re-enrollment submitted for admin review. Your current face template stays active until approved.',
    };
  }

  async createContractorRequest(args: {
    clientId: string;
    branchId: string | null;
    contractorEmployeeId: string;
    actorUserId: string;
    source: ReenrollRequestSource;
    embedding: Buffer;
    embeddingModel: string | null;
    photoUrl: string | null;
    reason?: string | null;
  }): Promise<{ status: 'PENDING_REVIEW'; requestId: string; message: string }> {
    const saved = await this.dataSource.transaction(async (em) => {
      await em.update(
        ContractorFaceReenrollmentRequestEntity,
        {
          contractorEmployeeId: args.contractorEmployeeId,
          status: 'PENDING',
        },
        {
          status: 'CANCELLED',
          reviewedAt: new Date(),
          reviewNotes: 'Superseded by newer request',
        },
      );
      return em.save(ContractorFaceReenrollmentRequestEntity, {
        clientId: args.clientId,
        branchId: args.branchId,
        contractorEmployeeId: args.contractorEmployeeId,
        requestedBy: args.actorUserId,
        requestedAt: new Date(),
        reason: args.reason ?? null,
        photoUrl: args.photoUrl,
        pendingEmbedding: args.embedding,
        embeddingModel: args.embeddingModel,
        source: args.source,
        status: 'PENDING',
      });
    });

    return {
      status: 'PENDING_REVIEW',
      requestId: saved.id,
      message:
        'Re-enrollment submitted for admin review. The current face template stays active until approved.',
    };
  }

  async listEmployeeRequests(
    clientId: string,
    status: ReenrollRequestStatus = 'PENDING',
    allowedBranchIds: string[] | null = null,
  ): Promise<ReenrollRequestRow[]> {
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (allowedBranchIds !== null) {
      params.push(allowedBranchIds);
      branchFilter = `AND r.branch_id = ANY($${params.length}::uuid[])`;
    }
    const rows = await this.dataSource.query<ReenrollRequestRow[]>(
      `SELECT r.id,
              r.employee_id AS "employeeId",
              e.employee_code AS "employeeCode",
              e.name AS "employeeName",
              r.branch_id AS "branchId",
              r.requested_by AS "requestedBy",
              r.requested_at AS "requestedAt",
              r.reason,
              CASE WHEN r.photo_url IS NOT NULL
                   THEN '/api/v1/mobile-attendance/enrollment/reenroll-requests/' || r.id::text || '/photo'
                   ELSE NULL END AS "photoUrl",
              r.source,
              r.status,
              r.reviewed_by AS "reviewedBy",
              r.reviewed_at AS "reviewedAt",
              r.review_notes AS "reviewNotes"
         FROM face_reenrollment_requests r
         JOIN employees e ON e.id = r.employee_id
        WHERE r.client_id = $1 AND r.status = $2 ${branchFilter}
        ORDER BY r.requested_at DESC
        LIMIT 500`,
      params,
    );
    return rows.map((r) => ({
      ...r,
      requestedAt: new Date(r.requestedAt).toISOString(),
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
    }));
  }

  async listContractorRequests(
    clientId: string,
    status: ReenrollRequestStatus = 'PENDING',
    allowedBranchIds: string[] | null = null,
  ): Promise<ContractorReenrollRequestRow[]> {
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (allowedBranchIds !== null) {
      params.push(allowedBranchIds);
      branchFilter = `AND r.branch_id = ANY($${params.length}::uuid[])`;
    }
    const rows = await this.dataSource.query<ContractorReenrollRequestRow[]>(
      `SELECT r.id,
              r.contractor_employee_id AS "contractorEmployeeId",
              ce.name AS "contractorName",
              r.branch_id AS "branchId",
              r.requested_by AS "requestedBy",
              r.requested_at AS "requestedAt",
              r.reason,
              CASE WHEN r.photo_url IS NOT NULL
                   THEN '/api/v1/mobile-attendance/enrollment/contractor-reenroll-requests/' || r.id::text || '/photo'
                   ELSE NULL END AS "photoUrl",
              r.source,
              r.status,
              r.reviewed_by AS "reviewedBy",
              r.reviewed_at AS "reviewedAt",
              r.review_notes AS "reviewNotes"
         FROM contractor_face_reenrollment_requests r
         JOIN contractor_employees ce ON ce.id = r.contractor_employee_id
        WHERE r.client_id = $1 AND r.status = $2 ${branchFilter}
        ORDER BY r.requested_at DESC
        LIMIT 500`,
      params,
    );
    return rows.map((r) => ({
      ...r,
      requestedAt: new Date(r.requestedAt).toISOString(),
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
    }));
  }

  async reviewEmployeeRequest(
    clientId: string,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    notes?: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    const req = await this.empReqRepo.findOne({ where: { id, clientId } });
    if (!req) throw new NotFoundException('Re-enrollment request not found');
    this.assertBranchAllowed(req.branchId, allowedBranchIds);
    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `Request is not pending (status: ${req.status})`,
      );
    }

    const newStatus = decision;
    if (decision === 'REJECTED') {
      await this.empReqRepo.update(
        { id },
        {
          status: 'REJECTED',
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? null,
        },
      );
      return { ok: true, status: 'REJECTED' };
    }

    await this.dataSource.transaction(async (em) => {
      await em.save(FaceEnrollmentEntity, {
        employeeId: req.employeeId,
        clientId: req.clientId,
        branchId: req.branchId,
        embedding: req.pendingEmbedding,
        embeddingModel: req.embeddingModel,
        photoUrl: req.photoUrl,
        consentGivenAt: new Date(),
        consentGivenBy: req.requestedBy,
        enrolledAt: new Date(),
        enrolledBy: req.requestedBy,
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
      });
      await em.save(FaceEnrollmentHistoryEntity, {
        employeeId: req.employeeId,
        clientId: req.clientId,
        action: 'RE_ENROLL',
        embeddingModel: req.embeddingModel,
        actorUserId,
      });
      await em.update(
        FaceReenrollmentRequestEntity,
        { id },
        {
          status: 'APPROVED',
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? null,
        },
      );
    });

    await this.templateService
      .appendTemplate(
        req.clientId,
        req.branchId,
        'EMPLOYEE',
        req.employeeId,
        bufferToEmbedding(req.pendingEmbedding),
        req.embeddingModel,
        'RE_ENROLL',
        actorUserId,
      )
      .catch(() => undefined);

    return { ok: true, status: 'APPROVED' };
  }

  async reviewContractorRequest(
    clientId: string,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    notes?: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    const req = await this.conReqRepo.findOne({ where: { id, clientId } });
    if (!req) throw new NotFoundException('Re-enrollment request not found');
    this.assertBranchAllowed(req.branchId, allowedBranchIds);
    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `Request is not pending (status: ${req.status})`,
      );
    }

    if (decision === 'REJECTED') {
      await this.conReqRepo.update(
        { id },
        {
          status: 'REJECTED',
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? null,
        },
      );
      return { ok: true, status: 'REJECTED' };
    }

    await this.dataSource.transaction(async (em) => {
      const existing = await em.findOne(ContractorFaceEnrollmentEntity, {
        where: { contractorEmployeeId: req.contractorEmployeeId },
      });
      await em.save(ContractorFaceEnrollmentEntity, {
        contractorEmployeeId: req.contractorEmployeeId,
        clientId: req.clientId,
        branchId: req.branchId,
        contractorUserId: existing?.contractorUserId ?? null,
        embedding: req.pendingEmbedding,
        embeddingModel: req.embeddingModel,
        photoUrl: req.photoUrl,
        consentGivenAt: new Date(),
        consentGivenBy: req.requestedBy,
        enrolledAt: new Date(),
        enrolledBy: req.requestedBy,
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
      });
      await em.save(FaceEnrollmentHistoryEntity, {
        contractorEmployeeId: req.contractorEmployeeId,
        clientId: req.clientId,
        action: 'RE_ENROLL',
        embeddingModel: req.embeddingModel,
        actorUserId,
      });
      await em.update(
        ContractorFaceReenrollmentRequestEntity,
        { id },
        {
          status: 'APPROVED',
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? null,
        },
      );
    });

    await this.templateService
      .appendTemplate(
        req.clientId,
        req.branchId,
        'CONTRACTOR',
        req.contractorEmployeeId,
        bufferToEmbedding(req.pendingEmbedding),
        req.embeddingModel,
        'RE_ENROLL',
        actorUserId,
      )
      .catch(() => undefined);

    return { ok: true, status: 'APPROVED' };
  }

  async getEmployeeRequestPhoto(
    clientId: string,
    id: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const req = await this.empReqRepo.findOne({ where: { id, clientId } });
    if (!req) throw new NotFoundException('Re-enrollment request not found');
    this.assertBranchAllowed(req.branchId, allowedBranchIds);
    return this.photoStorage.readPhoto(req.photoUrl);
  }

  async getContractorRequestPhoto(
    clientId: string,
    id: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const req = await this.conReqRepo.findOne({ where: { id, clientId } });
    if (!req) throw new NotFoundException('Re-enrollment request not found');
    this.assertBranchAllowed(req.branchId, allowedBranchIds);
    return this.photoStorage.readPhoto(req.photoUrl);
  }

  private assertBranchAllowed(
    branchId: string | null,
    allowedBranchIds: string[] | null,
  ): void {
    if (!allowedBranchIds) return;
    if (!branchId || !allowedBranchIds.includes(branchId)) {
      throw new NotFoundException('Re-enrollment request not found');
    }
  }
}
