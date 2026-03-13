import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';

export type ContractorDocumentCreateDto = {
  clientId?: string; // optional: will default to logged-in user's clientId
  branchId: string;
  docType: string;
  title: string;
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
    private readonly riskCache: AiRiskCacheInvalidatorService,
  ) {}

  async contractorUpload(
    user: any,
    dto: ContractorDocumentCreateDto,
    file: any,
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

    const row = this.repo.create({
      contractorUserId: user.id,
      clientId,
      branchId: dto.branchId,
      docType: dto.docType,
      title: dto.title,
      auditId: dto.auditId ?? null,
      observationId: dto.observationId ?? null,
      fileName: file.originalname,
      filePath: file.path,
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

  async contractorList(user: any, q: any) {
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
  async listByClient(user: any, q: any) {
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
    user: any,
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
    user: any,
    id: string,
    dto: ContractorDocumentReuploadDto,
    file: any,
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

    doc.fileName = file.originalname;
    doc.filePath = file.path;
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
