import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchDocumentEntity } from './entities/branch-document.entity';
import { BranchEntity } from './entities/branch.entity';

export type DocCategory =
  | 'REGISTRATION'
  | 'COMPLIANCE_MONTHLY'
  | 'AUDIT_EVIDENCE';
export type DocStatus = 'UPLOADED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface UploadDocDto {
  category: DocCategory;
  docType: string;
  periodYear?: number;
  periodMonth?: number;
}

@Injectable()
export class BranchDocumentsService {
  constructor(
    @InjectRepository(BranchDocumentEntity)
    private readonly docRepo: Repository<BranchDocumentEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  /* ── helpers ─────────────────────────────── */

  private async ensureBranchBelongsToClient(
    branchId: string,
    clientId: string,
  ) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false },
    });
    if (!branch || branch.clientId !== clientId) {
      throw new NotFoundException('Branch not found for this client');
    }
    return branch;
  }

  /**
   * MCD window: uploads for month M must happen between
   * the 20th and 27th of month M+1.
   */
  getMcdWindow(year: number, month: number) {
    // month is 1-based
    let windowYear = year;
    let windowMonth = month + 1;
    if (windowMonth > 12) {
      windowMonth = 1;
      windowYear += 1;
    }
    const start = new Date(windowYear, windowMonth - 1, 20);
    const end = new Date(windowYear, windowMonth - 1, 27, 23, 59, 59, 999);
    return { start, end };
  }

  isInsideMcdWindow(year: number, month: number, now = new Date()): boolean {
    const { start, end } = this.getMcdWindow(year, month);
    return now >= start && now <= end;
  }

  /* ── list ────────────────────────────────── */

  async listByBranch(
    branchId: string,
    clientId: string,
    filters?: {
      category?: string;
      status?: string;
      year?: number;
      month?: number;
    },
  ) {
    await this.ensureBranchBelongsToClient(branchId, clientId);

    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.branch_id = :branchId', { branchId })
      .orderBy('d.created_at', 'DESC');

    if (filters?.category)
      qb.andWhere('d.category = :cat', { cat: filters.category });
    if (filters?.status)
      qb.andWhere('d.status = :status', { status: filters.status });
    if (filters?.year)
      qb.andWhere('d.period_year = :year', { year: filters.year });
    if (filters?.month)
      qb.andWhere('d.period_month = :month', { month: filters.month });

    return qb.getMany();
  }

  /* ── upload (CLIENT role) ────────────────── */

  async upload(
    branchId: string,
    clientId: string,
    dto: UploadDocDto,
    file: Express.Multer.File,
    userId: string,
  ) {
    await this.ensureBranchBelongsToClient(branchId, clientId);

    if (!file) throw new BadRequestException('File is required');
    if (!dto.category || !dto.docType)
      throw new BadRequestException('category and docType are required');

    // For COMPLIANCE_MONTHLY, enforce MCD window
    if (dto.category === 'COMPLIANCE_MONTHLY') {
      if (!dto.periodYear || !dto.periodMonth) {
        throw new BadRequestException(
          'periodYear and periodMonth required for COMPLIANCE_MONTHLY',
        );
      }
      if (!this.isInsideMcdWindow(dto.periodYear, dto.periodMonth)) {
        throw new BadRequestException(
          'Upload window closed. Monthly compliance documents must be uploaded between 20th-27th of the following month.',
        );
      }
    }

    // Determine reviewer role
    let reviewerRole: string | null = null;
    if (dto.category === 'COMPLIANCE_MONTHLY') reviewerRole = 'CRM';
    if (dto.category === 'AUDIT_EVIDENCE') reviewerRole = 'AUDITOR';

    const doc = this.docRepo.create({
      clientId,
      branchId,
      category: dto.category,
      docType: dto.docType,
      periodYear: dto.periodYear ?? null,
      periodMonth: dto.periodMonth ?? null,
      filePath: file.path,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      status: 'UPLOADED' as DocStatus,
      reviewerRole,
      uploadedBy: userId,
    });

    return this.docRepo.save(doc);
  }

  /* ── re-upload (CLIENT role, rejected docs only) ── */

  async reupload(
    docId: string,
    clientId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc || doc.clientId !== clientId)
      throw new NotFoundException('Document not found');
    if (doc.status !== 'REJECTED') {
      throw new BadRequestException(
        'Only rejected documents can be re-uploaded',
      );
    }

    // Re-check MCD window for compliance monthly
    if (
      doc.category === 'COMPLIANCE_MONTHLY' &&
      doc.periodYear &&
      doc.periodMonth
    ) {
      if (!this.isInsideMcdWindow(doc.periodYear, doc.periodMonth)) {
        throw new BadRequestException('Upload window closed for this period.');
      }
    }

    doc.filePath = file.path;
    doc.fileName = file.originalname;
    doc.mimeType = file.mimetype;
    doc.fileSize = file.size;
    doc.status = 'UPLOADED' as DocStatus;
    doc.reviewedBy = null;
    doc.reviewedAt = null;
    doc.remarks = null;
    doc.uploadedBy = userId;

    return this.docRepo.save(doc);
  }

  /* ── review (CRM / AUDITOR role) ─────────── */

  async review(
    docId: string,
    status: 'APPROVED' | 'REJECTED',
    remarks: string | null,
    reviewerId: string,
    reviewerRole: string,
  ) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');

    // Only the correct reviewer role can review
    if (doc.reviewerRole && doc.reviewerRole !== reviewerRole) {
      throw new ForbiddenException(
        `Only ${doc.reviewerRole} can review this document`,
      );
    }

    if (doc.status !== 'UPLOADED' && doc.status !== 'UNDER_REVIEW') {
      throw new BadRequestException('Document is not in a reviewable state');
    }

    doc.status = status;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.remarks = remarks ?? null;

    return this.docRepo.save(doc);
  }

  /* ── MCD schedule for a branch ───────────── */

  async getMcdSchedule(
    branchId: string,
    clientId: string,
    year: number,
    month: number,
  ) {
    await this.ensureBranchBelongsToClient(branchId, clientId);

    const { start, end } = this.getMcdWindow(year, month);
    const now = new Date();

    // Check existing uploads for this period
    const docs = await this.docRepo.find({
      where: {
        branchId,
        category: 'COMPLIANCE_MONTHLY' as DocCategory,
        periodYear: year,
        periodMonth: month,
      },
      order: { createdAt: 'DESC' },
    });

    let windowStatus: string;
    if (docs.length === 0) {
      windowStatus = now > end ? 'OVERDUE' : now >= start ? 'OPEN' : 'UPCOMING';
    } else {
      const latest = docs[0];
      if (latest.status === 'APPROVED') windowStatus = 'COMPLETED';
      else if (latest.status === 'REJECTED')
        windowStatus = now > end ? 'OVERDUE' : 'REUPLOAD_NEEDED';
      else windowStatus = 'UPLOADED';
    }

    return {
      periodYear: year,
      periodMonth: month,
      uploadWindowStart: start.toISOString(),
      uploadWindowEnd: end.toISOString(),
      windowStatus,
      isWindowOpen: now >= start && now <= end,
      documents: docs,
    };
  }

  /** Get MCD overview for the last N months for a branch */
  async getMcdOverview(branchId: string, clientId: string, months = 6) {
    await this.ensureBranchBelongsToClient(branchId, clientId);
    const now = new Date();
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i < months; i++) {
      let y = now.getFullYear();
      let m = now.getMonth() + 1 - i; // 1-based
      if (m <= 0) {
        m += 12;
        y -= 1;
      }

      const schedule = await this.getMcdSchedule(branchId, clientId, y, m);
      results.push(schedule);
    }

    return results;
  }
}
