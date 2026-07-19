import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { AuditEntity } from '../audits/entities/audit.entity';
import { AuditObservationEntity } from '../audits/entities/audit-observation.entity';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { ReqUser } from '../access/access-scope.service';
import * as path from 'path';

export type ContractorDocumentCreateDto = {
  clientId?: string; // optional: will default to logged-in user's clientId
  branchId: string;
  docType: string;
  title: string;
  month?: string | null; // YYYY-MM — which month this document belongs to
  auditId?: string | null;
  observationId?: string | null;
};

export type ContractorDocumentReviewDto = {
  status: 'APPROVED' | 'REJECTED';
  reviewNotes?: string | null;
  expiryDate?: string | null;
};

export type ContractorDocumentReuploadDto = {
  title?: string;
};

@Injectable()
export class ContractorDocumentsService {
  private readonly logger = new Logger(ContractorDocumentsService.name);

  constructor(
    @InjectRepository(ContractorDocumentEntity)
    private readonly repo: Repository<ContractorDocumentEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    private readonly riskCache: AiRiskCacheInvalidatorService,
  ) {}

  private toUploadsRelativePath(filePath: string): string {
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const resolved = path.resolve(filePath);
    const relative = path.relative(uploadsRoot, resolved);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.replace(/\\/g, '/');
    }
    return filePath.replace(/^\/?uploads[\\/]/i, '').replace(/\\/g, '/');
  }

  /**
   * Validate that an audit (and optional observation) the contractor is
   * attaching a document to actually belongs to the contractor's client +
   * the requested branch (and, when the audit is contractor-scoped, to
   * the same contractor). Prevents UUID-guessing cross-tenant attaches
   * that would otherwise surface in another auditor's review list.
   */
  private async assertAuditScope(params: {
    auditId: string | null | undefined;
    observationId: string | null | undefined;
    clientId: string;
    branchId: string;
    contractorUserId: string;
  }): Promise<void> {
    const { auditId, observationId, clientId, branchId, contractorUserId } =
      params;
    if (!auditId) {
      if (observationId) {
        throw new BadRequestException(
          'observationId requires a matching auditId',
        );
      }
      return;
    }
    const audit = await this.auditRepo.findOne({
      where: { id: auditId },
      select: ['id', 'clientId', 'branchId', 'contractorUserId'],
    });
    if (!audit) throw new BadRequestException('Audit not found');
    if (audit.clientId !== clientId) {
      throw new BadRequestException('Audit does not belong to this client');
    }
    if (audit.branchId && audit.branchId !== branchId) {
      throw new BadRequestException('Audit does not belong to this branch');
    }
    if (audit.contractorUserId && audit.contractorUserId !== contractorUserId) {
      throw new BadRequestException('Audit is not assigned to this contractor');
    }
    if (observationId) {
      const obs = await this.observationRepo.findOne({
        where: { id: observationId },
        select: ['id', 'auditId'],
      });
      if (!obs) throw new BadRequestException('Observation not found');
      if (obs.auditId !== auditId) {
        throw new BadRequestException(
          'Observation does not belong to this audit',
        );
      }
    }
  }

  /**
   * Throws if the audit has an active upload lock window today.
   *
   * @param auditId       Audit the document is tied to (null = no lock check).
   * @param opts.allowRejectedReupload
   *                      If true, the lock is bypassed (item #10:
   *                      contractors may always re-upload a previously
   *                      REJECTED document, even while the audit window
   *                      is locked, so that auditor-flagged corrections
   *                      can be addressed without unlocking everything).
   */
  private async assertUploadNotLocked(
    auditId: string | null | undefined,
    opts?: { allowRejectedReupload?: boolean },
  ): Promise<void> {
    if (!auditId) return;
    if (opts?.allowRejectedReupload) return;
    const audit = await this.auditRepo.findOne({
      where: { id: auditId },
      select: ['id', 'uploadLockFrom', 'uploadLockUntil'],
    });
    if (!audit) return; // unknown audit — let the upload proceed
    const { uploadLockFrom, uploadLockUntil } = audit;
    if (!uploadLockFrom || !uploadLockUntil) return;
    const today = new Date().toISOString().slice(0, 10);
    if (today >= uploadLockFrom && today <= uploadLockUntil) {
      throw new BadRequestException(
        `Document uploads are locked by the auditor until ${uploadLockUntil}. Please wait for the lock period to end before uploading.`,
      );
    }
  }

  async contractorUpload(
    user: ReqUser,
    dto: ContractorDocumentCreateDto,
    file: Express.Multer.File,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }
    if (!dto?.branchId) throw new BadRequestException('branchId is required');
    if (!dto?.docType) throw new BadRequestException('docType is required');
    if (!dto?.title) throw new BadRequestException('title is required');
    if (!file) throw new BadRequestException('file is required');

    const clientId = dto.clientId ?? user.clientId;
    if (clientId !== user.clientId) {
      throw new BadRequestException('Invalid clientId');
    }

    // Ensure contractor is mapped to the branch (branch_contractor is single source of truth)
    const link = await this.branchContractorRepo.findOne({
      where: {
        clientId,
        branchId: dto.branchId,
        contractorUserId: user.id,
      },
    });
    if (!link) {
      throw new BadRequestException('Contractor is not mapped to this branch');
    }

    // Validate audit/observation scope before any further side-effects.
    await this.assertAuditScope({
      auditId: dto.auditId ?? null,
      observationId: dto.observationId ?? null,
      clientId,
      branchId: dto.branchId,
      contractorUserId: user.id,
    });

    // Check upload lock window for this audit (if provided)
    await this.assertUploadNotLocked(dto.auditId);

    // Resolve doc_month: use provided month or fall back to current YYYY-MM
    let docMonth: string | null = null;
    if (dto.month?.trim()) {
      const m = dto.month.trim();
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
        docMonth = m;
      }
    }
    if (!docMonth) {
      const now = new Date();
      docMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    const row = this.repo.create({
      contractorUserId: user.id,
      clientId,
      branchId: dto.branchId,
      docType: dto.docType,
      title: dto.title,
      auditId: dto.auditId ?? null,
      observationId: dto.observationId ?? null,
      docMonth,
      fileName: file.originalname,
      filePath: this.toUploadsRelativePath(file.path),
      fileType: file.mimetype ?? null,
      fileSize: file.size != null ? String(file.size) : null,
      uploadedByUserId: user.id,
      status: 'PENDING_REVIEW',
    });

    const saved = await this.repo.save(row);
    this.riskCache
      .invalidateBranch(saved.branchId)
      .catch((e) =>
        this.logger.warn('riskCache invalidation failed', e?.message),
      );
    return {
      id: saved.id,
      contractorUserId: saved.contractorUserId,
      clientId: saved.clientId,
      branchId: saved.branchId,
      docType: saved.docType,
      title: saved.title,
      auditId: saved.auditId,
      observationId: saved.observationId,
      fileName: saved.fileName,
      filePath: saved.filePath,
      fileType: saved.fileType,
      fileSize: saved.fileSize,
      uploadedByUserId: saved.uploadedByUserId,
      createdAt: saved.createdAt,
    };
  }

  async contractorList(user: ReqUser, q: Record<string, string>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }

    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.contractor_user_id = :contractorId', { contractorId: user.id })
      .andWhere('d.client_id = :clientId', { clientId: user.clientId });

    if (q?.branchId)
      qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q?.branchIds && Array.isArray(q.branchIds) && q.branchIds.length)
      qb.andWhere('d.branch_id IN (:...branchIds)', { branchIds: q.branchIds });
    if (q?.auditId)
      qb.andWhere('d.audit_id = :auditId', { auditId: q.auditId });
    if (q?.observationId)
      qb.andWhere('d.observation_id = :observationId', {
        observationId: q.observationId,
      });
    if (q?.docType)
      qb.andWhere('d.doc_type = :docType', { docType: q.docType });

    qb.orderBy('d.created_at', 'DESC');

    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      contractorUserId: r.contractorUserId,
      clientId: r.clientId,
      branchId: r.branchId,
      docType: r.docType,
      title: r.title,
      auditId: r.auditId,
      observationId: r.observationId,
      fileName: r.fileName,
      filePath: r.filePath,
      fileType: r.fileType,
      fileSize: r.fileSize,
      uploadedByUserId: r.uploadedByUserId,
      status: r.status,
      expiryDate: r.expiryDate,
      reviewedAt: r.reviewedAt,
      reviewedByUserId: r.reviewedByUserId,
      reviewNotes: r.reviewNotes,
      createdAt: r.createdAt,
    }));
  }

  /** CRM/Admin listing: can list any contractor's documents within a client. */
  async listByClient(_user: ReqUser, q: Record<string, string>) {
    if (!q?.clientId) throw new BadRequestException('clientId is required');

    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.client_id = :clientId', { clientId: q.clientId });

    if (q?.contractorId)
      qb.andWhere('d.contractor_user_id = :contractorId', {
        contractorId: q.contractorId,
      });
    if (q?.branchId)
      qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q?.branchIds && Array.isArray(q.branchIds) && q.branchIds.length)
      qb.andWhere('d.branch_id IN (:...branchIds)', { branchIds: q.branchIds });
    if (q?.auditId)
      qb.andWhere('d.audit_id = :auditId', { auditId: q.auditId });
    if (q?.observationId)
      qb.andWhere('d.observation_id = :observationId', {
        observationId: q.observationId,
      });
    if (q?.docType)
      qb.andWhere('d.doc_type = :docType', { docType: q.docType });

    qb.orderBy('d.created_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      contractorUserId: r.contractorUserId,
      clientId: r.clientId,
      branchId: r.branchId,
      docType: r.docType,
      title: r.title,
      auditId: r.auditId,
      observationId: r.observationId,
      fileName: r.fileName,
      filePath: r.filePath,
      fileType: r.fileType,
      fileSize: r.fileSize,
      status: r.status,
      expiryDate: r.expiryDate,
      reviewedAt: r.reviewedAt,
      reviewedByUserId: r.reviewedByUserId,
      reviewNotes: r.reviewNotes,
      uploadedByUserId: r.uploadedByUserId,
      createdAt: r.createdAt,
    }));
  }

  async reviewDocument(
    user: ReqUser,
    id: string,
    dto: ContractorDocumentReviewDto,
  ) {
    if (!id) throw new BadRequestException('id is required');
    if (!dto?.status) throw new BadRequestException('status is required');

    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new BadRequestException('Document not found');

    if (!['APPROVED', 'REJECTED'].includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }

    doc.status = dto.status;
    doc.reviewNotes = dto.reviewNotes ?? null;
    doc.expiryDate = dto.expiryDate ?? null;
    doc.reviewedByUserId = user?.id ?? null;
    doc.reviewedAt = new Date();

    const saved = await this.repo.save(doc);
    this.riskCache
      .invalidateBranch(saved.branchId)
      .catch((e) =>
        this.logger.warn('riskCache invalidation failed', e?.message),
      );
    return {
      id: saved.id,
      status: saved.status,
      reviewNotes: saved.reviewNotes,
      expiryDate: saved.expiryDate,
      reviewedAt: saved.reviewedAt,
      reviewedByUserId: saved.reviewedByUserId,
    };
  }

  async contractorReupload(
    user: ReqUser,
    id: string,
    dto: ContractorDocumentReuploadDto,
    file: Express.Multer.File,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }
    if (!id) throw new BadRequestException('id is required');
    if (!file) throw new BadRequestException('file is required');

    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new BadRequestException('Document not found');
    if (doc.contractorUserId !== user.id || doc.clientId !== user.clientId) {
      throw new BadRequestException('Not authorized to modify this document');
    }

    const link = await this.branchContractorRepo.findOne({
      where: {
        clientId: doc.clientId,
        branchId: doc.branchId,
        contractorUserId: user.id,
      },
    });
    if (!link) {
      throw new BadRequestException('Contractor is not mapped to this branch');
    }

    // Item #10: re-uploads of REJECTED docs bypass the audit upload lock —
    // contractors must always be able to address auditor-flagged corrections.
    await this.assertUploadNotLocked(doc.auditId, {
      allowRejectedReupload: doc.status === 'REJECTED',
    });

    doc.fileName = file.originalname;
    doc.filePath = this.toUploadsRelativePath(file.path);
    doc.fileType = file.mimetype ?? null;
    doc.fileSize = file.size != null ? String(file.size) : null;
    doc.title = dto?.title ?? doc.title;
    doc.status = 'PENDING_REVIEW';
    doc.reviewedAt = null;
    doc.reviewedByUserId = null;
    doc.reviewNotes = null;
    doc.expiryDate = null;

    const saved = await this.repo.save(doc);
    this.riskCache
      .invalidateBranch(saved.branchId)
      .catch((e) =>
        this.logger.warn('riskCache invalidation failed', e?.message),
      );
    return {
      id: saved.id,
      contractorUserId: saved.contractorUserId,
      clientId: saved.clientId,
      branchId: saved.branchId,
      docType: saved.docType,
      title: saved.title,
      status: saved.status,
      fileName: saved.fileName,
      filePath: saved.filePath,
      fileType: saved.fileType,
      fileSize: saved.fileSize,
      createdAt: saved.createdAt,
    };
  }
}
