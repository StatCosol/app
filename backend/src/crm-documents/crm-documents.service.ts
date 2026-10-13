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
import { uniqueUploadDiskName } from '../common/safe-upload';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
};

type DocumentScope = 'COMPANY' | 'BRANCH';
type PreparedUpload = {
  doc: CrmUnitDocumentEntity;
  fullPath: string;
};

const MAX_CRM_UPLOAD_TOTAL_BYTES = 50 * 1024 * 1024;

@Injectable()
export class CrmDocumentsService {
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
    'application/x-zip-compressed',
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

    const prepared = this.prepareUploadRecord(dto, file, crmUserId, scope);
    try {
      return (await this.persistUploads([prepared], dto))[0];
    } catch (err) {
      this.safeUnlink(prepared.fullPath);
      throw err;
    }
  }

  async uploadForBranch(
    dto: UploadCrmDocumentDto,
    file: UploadedFile,
    userId: string,
    clientId: string | null,
    branchIds: string[],
  ) {
    if (
      !clientId ||
      dto.clientId !== clientId ||
      !dto.branchId ||
      !branchIds.includes(dto.branchId)
    ) {
      throw new ForbiddenException(
        'Upload is only allowed for your mapped branch',
      );
    }
    const scope = this.resolveScope(dto);
    if (scope !== 'BRANCH')
      throw new ForbiddenException('Branch users must upload to a branch');
    await this.assertBranchBelongsToClient(dto.branchId, clientId);
    const prepared = this.prepareUploadRecord(dto, file, userId, scope);
    prepared.doc.uploadedByRole = 'BRANCH';
    prepared.doc.actingOnBehalf = false;
    try {
      return (await this.persistUploads([prepared], dto))[0];
    } catch (err) {
      this.safeUnlink(prepared.fullPath);
      throw err;
    }
  }

  async uploadMany(
    dto: UploadCrmDocumentDto,
    files: UploadedFile[],
    crmUserId: string,
  ): Promise<CrmUnitDocumentEntity[]> {
    if (!files.length) {
      throw new BadRequestException('At least one file is required');
    }

    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    if (totalBytes > MAX_CRM_UPLOAD_TOTAL_BYTES) {
      throw new BadRequestException('Total upload size must not exceed 50 MB');
    }

    const scope = this.resolveScope(dto);
    await this.assertCrmAssigned(dto.clientId, crmUserId);
    if (scope === 'BRANCH' && dto.branchId) {
      await this.assertBranchBelongsToClient(dto.branchId, dto.clientId);
    }

    const prepared: PreparedUpload[] = [];
    try {
      for (const file of files) {
        prepared.push(this.prepareUploadRecord(dto, file, crmUserId, scope));
      }

      return await this.persistUploads(prepared, dto);
    } catch (err) {
      for (const item of prepared) {
        this.safeUnlink(item.fullPath);
      }
      throw err;
    }
  }

  private isRegistration(dto: UploadCrmDocumentDto): boolean {
    return ['registration', 'licence', 'license', 'renewal'].includes(
      dto.documentType.toLowerCase(),
    );
  }

  async registrationOptions(clientId: string, branchId: string) {
    await this.assertBranchBelongsToClient(branchId, clientId);
    return this.docRepo.manager.query(
      `SELECT id, type, registration_number AS "registrationNumber", expiry_date::text AS "expiryDate"
       FROM branch_registrations WHERE client_id=$1 AND branch_id=$2 AND status <> 'DELETED' ORDER BY type, registration_number`,
      [clientId, branchId],
    );
  }

  private async persistUploads(
    prepared: PreparedUpload[],
    dto: UploadCrmDocumentDto,
  ) {
    if (!this.isRegistration(dto)) {
      return this.docRepo.manager.transaction((manager) =>
        manager.save(
          CrmUnitDocumentEntity,
          prepared.map((p) => p.doc),
        ),
      );
    }
    if (prepared.length !== 1)
      throw new BadRequestException(
        'Upload one registration or renewal file at a time',
      );
    return this.docRepo.manager.transaction(async (manager) => {
      const doc = prepared[0].doc;
      const fileUrl = '/uploads/' + doc.filePath.replace(/\\/g, '/');
      let registrationId: string;
      if (dto.documentType.toLowerCase() === 'renewal') {
        const [record] = await manager.query(
          `SELECT id, expiry_date::text AS expiry_date FROM branch_registrations
           WHERE id=$1 AND client_id=$2 AND branch_id=$3 AND status <> 'DELETED' FOR UPDATE`,
          [dto.registrationId, dto.clientId, dto.branchId],
        );
        if (!record)
          throw new ForbiddenException(
            'Registration is not available for this branch',
          );
        if (
          record.expiry_date &&
          dto.periodTo &&
          dto.periodTo <= record.expiry_date
        ) {
          throw new BadRequestException(
            'Renewal expiry must be later than the current expiry',
          );
        }
        await manager.query(
          `UPDATE branch_registrations SET expiry_date=$2, renewal_document_url=$3,
           renewed_on=NOW(), status=CASE WHEN status='SUSPENDED' THEN status ELSE 'ACTIVE' END, updated_at=NOW() WHERE id=$1`,
          [record.id, dto.noExpiry === 'true' ? null : dto.periodTo, fileUrl],
        );
        registrationId = record.id;
      } else {
        const type = dto.registrationType!.trim();
        const number = dto.registrationNumber?.trim() || null;
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          JSON.stringify([
            dto.clientId,
            dto.branchId,
            type.toLowerCase(),
            number,
          ]),
        ]);
        const existing = await manager.query(
          `SELECT id FROM branch_registrations WHERE client_id=$1 AND branch_id=$2
           AND lower(type)=lower($3) AND registration_number IS NOT DISTINCT FROM $4 AND status <> 'DELETED'`,
          [dto.clientId, dto.branchId, type, number],
        );
        if (existing.length)
          throw new BadRequestException(
            'This registration already exists. Select Renewal to update its expiry',
          );
        const [created] = await manager.query(
          `INSERT INTO branch_registrations(client_id,branch_id,type,registration_number,authority,issued_date,expiry_date,document_url,created_by,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE') RETURNING id`,
          [
            dto.clientId,
            dto.branchId,
            type,
            number,
            dto.authority?.trim() || null,
            dto.periodFrom || null,
            dto.noExpiry === 'true' ? null : dto.periodTo,
            fileUrl,
            doc.uploadedBy,
          ],
        );
        registrationId = created.id;
      }
      doc.registrationId = registrationId;
      return manager.save(CrmUnitDocumentEntity, [doc]);
    });
  }

  private async withRegistrationStatus(docs: CrmUnitDocumentEntity[]) {
    const ids = [...new Set(docs.map((d) => d.registrationId).filter(Boolean))];
    if (!ids.length) return docs;
    const rows = await this.docRepo.manager.query(
      `SELECT id, type, expiry_date::text AS "expiryDate", CASE
         WHEN status='DELETED' THEN 'REMOVED'
         WHEN expiry_date IS NULL THEN 'NO_EXPIRY'
         WHEN expiry_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 'EXPIRED'
         WHEN expiry_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '60 days' THEN 'EXPIRING_SOON'
         ELSE 'ACTIVE' END AS status
       FROM branch_registrations WHERE id=ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((r: any) => [r.id, r]));
    return docs.map((doc) => ({
      ...doc,
      registration: byId.get(doc.registrationId) || null,
    }));
  }

  private prepareUploadRecord(
    dto: UploadCrmDocumentDto,
    file: UploadedFile,
    crmUserId: string,
    scope: DocumentScope,
  ): PreparedUpload {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" not allowed. Allowed: PDF, PNG, JPG, XLSX, XLS, ZIP`,
      );
    }

    if (dto.periodFrom && dto.periodTo && dto.periodTo < dto.periodFrom) {
      throw new BadRequestException(
        'Valid until must be on or after valid from',
      );
    }
    if (this.isRegistration(dto)) {
      if (scope !== 'BRANCH')
        throw new BadRequestException(
          'Select a branch for registration and renewal expiry tracking',
        );
      if (!dto.periodTo && dto.noExpiry !== 'true')
        throw new BadRequestException(
          'Enter the expiry date or select No expiry',
        );
      if (dto.periodTo && dto.noExpiry === 'true')
        throw new BadRequestException(
          'Choose an expiry date or No expiry, not both',
        );
      if (dto.documentType.toLowerCase() === 'renewal') {
        if (!dto.registrationId)
          throw new BadRequestException(
            'Select the registration being renewed',
          );
      } else {
        if (dto.registrationId)
          throw new BadRequestException(
            'Select Renewal to update an existing registration',
          );
        if (!dto.registrationType?.trim())
          throw new BadRequestException(
            'Enter the registration or licence name',
          );
      }
    } else if (
      dto.registrationId ||
      dto.registrationType ||
      dto.registrationNumber ||
      dto.authority ||
      dto.noExpiry === 'true'
    ) {
      throw new BadRequestException(
        'Registration details apply only to registrations, licences and renewals',
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

    const diskName = uniqueUploadDiskName(file.originalname);
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

    return { doc, fullPath };
  }

  private safeUnlink(fullPath: string): void {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      /* best-effort cleanup */
    }
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
    return this.withRegistrationStatus(await qb.getMany());
  }

  /* ───────── CRM: delete (soft) ───────── */

  async softDelete(docId: string, crmUserId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Document not found');
    }
    // Verify assignment
    await this.assertCrmAssigned(doc.clientId, crmUserId);

    if (doc.registrationId)
      throw new BadRequestException(
        'Linked registration evidence must be retained. Upload a renewal to update expiry',
      );
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
      // Note: 'ALL' is treated as "no explicit mappings"; a true branch user
      // must have a concrete branch list, otherwise we deny branch-scoped
      // access to prevent master-style users from downloading branch docs
      // outside their mapping.
      const branchIds = opts?.allowedBranchIds;
      if (doc.branchId) {
        if (!Array.isArray(branchIds) || !branchIds.includes(doc.branchId)) {
          throw new ForbiddenException(
            'You do not have access to this document',
          );
        }
      } else if (!opts?.allowedClientIds?.includes(doc.clientId)) {
        throw new ForbiddenException('You do not have access to this document');
      }
    }

    if (!['CRM', 'CLIENT', 'BRANCH_USER'].includes(role))
      throw new ForbiddenException('Unsupported document role');
    const absolutePath = this.resolveUploadPath(doc.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return {
      absolutePath,
      fileName: doc.fileName,
      mimeType: doc.mimeType || 'application/octet-stream',
    };
  }

  /**
   * Resolve a stored path under uploads/, and refuse anything that climbs out.
   *
   * filePath is written by this service from validated parts — clientId and
   * branchId are UUIDs and month is matched against YYYY-MM — so this is not a
   * live hole. It is one careless writer away from being one, and
   * FilesController guards the equivalent.
   */
  private resolveUploadPath(filePath: string): string {
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const resolved = path.resolve(uploadsRoot, filePath);
    const rel = path.relative(uploadsRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ForbiddenException('Invalid document path');
    }
    return resolved;
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
    return this.withRegistrationStatus(await qb.getMany());
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
    return this.withRegistrationStatus(await qb.getMany());
  }
}
