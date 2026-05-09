import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

import { CrmUnitDocumentEntity } from './entities/crm-unit-document.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { UploadCrmDocumentDto } from './dto/upload-crm-document.dto';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
};

type DocumentScope = 'COMPANY' | 'BRANCH';

@Injectable()
export class CrmDocumentsService {
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
  ]);

  constructor(
    @InjectRepository(CrmUnitDocumentEntity)
    private readonly docRepo: Repository<CrmUnitDocumentEntity>,
    @InjectRepository(ClientAssignmentCurrentEntity)
    private readonly assignmentRepo: Repository<ClientAssignmentCurrentEntity>,
  ) {}

  /* ───────── helpers ───────── */

  /** Verify CRM user is assigned to this client */
  async assertCrmAssigned(clientId: string, crmUserId: string): Promise<void> {
    const row = await this.assignmentRepo.findOne({
      where: {
        clientId,
        assignmentType: 'CRM',
        assignedToUserId: crmUserId,
      },
    });
    if (!row) {
      throw new ForbiddenException('Client not assigned to you');
    }
  }

  /** Get all client IDs assigned to this CRM user */
  async getCrmClientIds(crmUserId: string): Promise<string[]> {
    const rows = await this.assignmentRepo.find({
      where: { assignmentType: 'CRM', assignedToUserId: crmUserId },
      select: ['clientId'],
    });
    return rows.map((r) => r.clientId);
  }

  /** Verify branch belongs to client */
  private async assertBranchBelongsToClient(
    branchId: string,
    clientId: string,
  ): Promise<void> {
    const result = await this.docRepo.manager.query(
      `SELECT id FROM client_branches WHERE id = $1 AND clientid = $2 AND isactive = TRUE AND isdeleted = FALSE`,
      [branchId, clientId],
    );
    if (!result?.length) {
      throw new BadRequestException('Branch does not belong to this client');
    }
  }

  private resolveScope(input?: {
    branchId?: string | null;
    scope?: string | null;
  }): DocumentScope {
    const normalized = (input?.scope || '').toUpperCase();
    const scope: DocumentScope =
      normalized === 'COMPANY' || normalized === 'BRANCH'
        ? (normalized as DocumentScope)
        : input?.branchId
          ? 'BRANCH'
          : 'COMPANY';

    if (scope === 'BRANCH' && !input?.branchId) {
      throw new BadRequestException(
        'branchId is required when scope is BRANCH',
      );
    }
    if (scope === 'COMPANY' && input?.branchId) {
      throw new BadRequestException(
        'branchId must be empty when scope is COMPANY',
      );
    }
    return scope;
  }

  async getClientIdsForBranchIds(branchIds: string[]): Promise<string[]> {
    if (!branchIds.length) return [];
    const rows = await this.docRepo.manager.query(
      `SELECT DISTINCT clientid
         FROM client_branches
        WHERE id = ANY($1::uuid[])
          AND isactive = TRUE
          AND isdeleted = FALSE`,
      [branchIds],
    );
    return rows
      .map((row: { clientid: string | null | undefined }) => row.clientid)
      .filter((value: string | null | undefined) => !!value);
  }

  /* ───────── CRM: upload ───────── */

  async upload(
    dto: UploadCrmDocumentDto,
    file: UploadedFile,
    crmUserId: string,
  ): Promise<CrmUnitDocumentEntity> {
    const scope = this.resolveScope(dto);

    // Access check
    await this.assertCrmAssigned(dto.clientId, crmUserId);
    if (scope === 'BRANCH' && dto.branchId) {
      await this.assertBranchBelongsToClient(dto.branchId, dto.clientId);
    }

    // File validation
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" not allowed. Allowed: PDF, PNG, JPG, XLSX, XLS, ZIP`,
      );
    }

    // Build path: uploads/crm-documents/{clientId}/{scope}/{branchId|company}/{month}/...
    const monthDir = dto.month || 'no-month';
    const dir = path.join(
      process.cwd(),
      'uploads',
      'crm-documents',
      dto.clientId,
      scope.toLowerCase(),
      dto.branchId || 'company',
      monthDir,
    );
    fs.mkdirSync(dir, { recursive: true });

    const ts = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskName = `${ts}_${safeName}`;
    const fullPath = path.join(dir, diskName);
    fs.writeFileSync(fullPath, file.buffer);

    const relativePath = path.relative(
      path.join(process.cwd(), 'uploads'),
      fullPath,
    );

    // Save to DB
    const doc = this.docRepo.create({
      clientId: dto.clientId,
      scope,
      branchId: scope === 'BRANCH' ? dto.branchId! : null,
      month: dto.month || null,
      lawCategory: dto.lawCategory,
      documentType: dto.documentType,
      periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : null,
      periodTo: dto.periodTo ? new Date(dto.periodTo) : null,
      fileName: file.originalname,
      filePath: relativePath,
      mimeType: file.mimetype,
      fileSize: file.size || null,
      uploadedBy: crmUserId,
      remarks: dto.remarks || null,
      uploadedByRole: 'CRM',
      actingOnBehalf: true,
      originalOwnerRole: scope === 'BRANCH' ? 'BRANCH' : 'CLIENT',
    });

    return this.docRepo.save(doc);
  }

  /* ───────── CRM: list ───────── */

  async listForCrm(
    crmUserId: string,
    filters: {
      clientId?: string;
      branchId?: string;
      scope?: DocumentScope;
      month?: string;
      lawCategory?: string;
      documentType?: string;
    },
  ): Promise<CrmUnitDocumentEntity[]> {
    const assignedIds = await this.getCrmClientIds(crmUserId);
    if (!assignedIds.length) return [];

    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.deletedAt IS NULL')
      .andWhere('d.clientId IN (:...assignedIds)', { assignedIds });

    if (filters.clientId) {
      qb.andWhere('d.clientId = :clientId', { clientId: filters.clientId });
    }
    if (filters.branchId) {
      qb.andWhere('d.branchId = :branchId', { branchId: filters.branchId });
    }
    if (filters.scope) {
      qb.andWhere('d.scope = :scope', { scope: filters.scope });
    }
    if (filters.month) {
      qb.andWhere('d.month = :month', { month: filters.month });
    }
    if (filters.lawCategory) {
      qb.andWhere('d.lawCategory = :lawCategory', {
        lawCategory: filters.lawCategory,
      });
    }
    if (filters.documentType) {
      qb.andWhere('d.documentType = :documentType', {
        documentType: filters.documentType,
      });
    }

    qb.orderBy('d.createdAt', 'DESC');
    return qb.getMany();
  }

  /* ───────── CRM: delete (soft) ───────── */

  async softDelete(docId: string, crmUserId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Document not found');
    }
    // Verify assignment
    await this.assertCrmAssigned(doc.clientId, crmUserId);

    doc.deletedAt = new Date();
    doc.deletedBy = crmUserId;
    await this.docRepo.save(doc);
  }

  /* ───────── CRM: download ───────── */

  async getDocumentForDownload(
    docId: string,
    userId: string,
    role: string,
    opts?: {
      allowedBranchIds?: string[] | 'ALL';
      allowedClientIds?: string[];
      clientId?: string;
    },
  ): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    // Role-based access
    if (role === 'CRM') {
      await this.assertCrmAssigned(doc.clientId, userId);
    } else if (role === 'CLIENT') {
      // Client master: verify document belongs to their company
      if (!opts?.clientId || doc.clientId !== opts.clientId) {
        throw new ForbiddenException('You do not have access to this document');
      }
    } else if (role === 'BRANCH_USER') {
      // Branch user: branch-scoped docs must match a mapped branch; company docs
      // are visible when the user's mapped branches belong to the same client.
      const branchIds = opts?.allowedBranchIds;
      if (doc.branchId) {
        if (branchIds !== 'ALL' && !branchIds?.includes(doc.branchId)) {
          throw new ForbiddenException(
            'You do not have access to this document',
          );
        }
      } else if (!opts?.allowedClientIds?.includes(doc.clientId)) {
        throw new ForbiddenException('You do not have access to this document');
      }
    }

    const absolutePath = path.join(process.cwd(), 'uploads', doc.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return {
      absolutePath,
      fileName: doc.fileName,
      mimeType: doc.mimeType || 'application/octet-stream',
    };
  }

  /* ───────── Client Master: list ───────── */

  async listForClient(
    clientId: string,
    filters: {
      branchId?: string;
      scope?: DocumentScope;
      month?: string;
      lawCategory?: string;
      documentType?: string;
    },
  ): Promise<CrmUnitDocumentEntity[]> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.deletedAt IS NULL')
      .andWhere('d.clientId = :clientId', { clientId });

    if (filters.branchId) {
      qb.andWhere('d.branchId = :branchId', { branchId: filters.branchId });
    }
    if (filters.scope) {
      qb.andWhere('d.scope = :scope', { scope: filters.scope });
    }
    if (filters.month) {
      qb.andWhere('d.month = :month', { month: filters.month });
    }
    if (filters.lawCategory) {
      qb.andWhere('d.lawCategory = :lawCategory', {
        lawCategory: filters.lawCategory,
      });
    }
    if (filters.documentType) {
      qb.andWhere('d.documentType = :documentType', {
        documentType: filters.documentType,
      });
    }

    qb.orderBy('d.createdAt', 'DESC');
    return qb.getMany();
  }

  /* ───────── Branch user: list ───────── */

  async listForBranch(
    branchIds: string[],
    filters: {
      scope?: DocumentScope;
      month?: string;
      lawCategory?: string;
      documentType?: string;
    },
  ): Promise<CrmUnitDocumentEntity[]> {
    if (!branchIds.length) return [];
    const clientIds = await this.getClientIdsForBranchIds(branchIds);

    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.deletedAt IS NULL');

    if (filters.scope === 'BRANCH') {
      qb.andWhere('d.branchId IN (:...branchIds)', { branchIds });
    } else if (filters.scope === 'COMPANY') {
      if (!clientIds.length) return [];
      qb.andWhere('d.branchId IS NULL').andWhere(
        'd.clientId IN (:...clientIds)',
        { clientIds },
      );
    } else if (clientIds.length) {
      qb.andWhere(
        '(d.branchId IN (:...branchIds) OR (d.branchId IS NULL AND d.clientId IN (:...clientIds)))',
        { branchIds, clientIds },
      );
    } else {
      qb.andWhere('d.branchId IN (:...branchIds)', { branchIds });
    }

    if (filters.month) {
      qb.andWhere('d.month = :month', { month: filters.month });
    }
    if (filters.lawCategory) {
      qb.andWhere('d.lawCategory = :lawCategory', {
        lawCategory: filters.lawCategory,
      });
    }
    if (filters.documentType) {
      qb.andWhere('d.documentType = :documentType', {
        documentType: filters.documentType,
      });
    }

    qb.orderBy('d.createdAt', 'DESC');
    return qb.getMany();
  }
}
