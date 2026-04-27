import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { Cron, CronExpression } from '@nestjs/schedule';

import { SafetyDocumentEntity } from './entities/safety-document.entity';
import { UploadSafetyDocumentDto } from './dto/upload-safety-document.dto';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Category weights for Safety Risk Score */
const CATEGORY_WEIGHTS: Record<string, number> = {
  'Statutory Safety Certificates': 0.2,
  'Safety Inspections': 0.15,
  'Equipment Inspections': 0.15,
  'Emergency Preparedness': 0.12,
  'Incident Reports': 0.1,
  'Training & Awareness': 0.1,
  'Medical & Health': 0.08,
  'Safety Audits': 0.05,
  'Environmental Safety': 0.03,
  'Event Based Incidents': 0.02,
};

@Injectable()
export class SafetyDocumentsService {
  private readonly logger = new Logger(SafetyDocumentsService.name);

  constructor(
    @InjectRepository(SafetyDocumentEntity)
    private readonly repo: Repository<SafetyDocumentEntity>,
  ) {}

  /** Verify CRM user is assigned to this client */
  async assertCrmAssigned(clientId: string, crmUserId: string): Promise<void> {
    const result = await this.repo.manager.query(
      `SELECT 1 FROM client_assignments_current
       WHERE client_id = $1 AND assignment_type = 'CRM' AND assigned_to_user_id = $2`,
      [clientId, crmUserId],
    );
    if (!result?.length) {
      throw new ForbiddenException('Client not assigned to you');
    }
  }

  /* ═══════════════════════════════════════════════════
     Master List
     ═══════════════════════════════════════════════════ */

  async getMasterList(filters?: {
    frequency?: string;
    category?: string;
    applicableTo?: string;
  }): Promise<any[]> {
    let sql = `SELECT * FROM safety_document_master WHERE is_active = true`;
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.frequency) {
      sql += ` AND frequency = $${idx++}`;
      params.push(filters.frequency);
    }
    if (filters?.category) {
      sql += ` AND category = $${idx++}`;
      params.push(filters.category);
    }
    if (filters?.applicableTo) {
      sql += ` AND (applicable_to = $${idx++} OR applicable_to = 'ALL')`;
      params.push(filters.applicableTo);
    }
    sql += ` ORDER BY sort_order`;

    return this.repo.manager.query(sql, params);
  }

  async getMasterCategories(): Promise<string[]> {
    const rows = await this.repo.manager.query(
      `SELECT DISTINCT category FROM safety_document_master WHERE is_active = true ORDER BY category`,
    );
    return rows.map((r: { category: string }) => r.category);
  }

  /* ═══════════════════════════════════════════════════
     Branch user: Upload
     ═══════════════════════════════════════════════════ */

  async upload(
    dto: UploadSafetyDocumentDto,
    file: UploadedFile,
    userId: string,
    clientId: string,
  ): Promise<SafetyDocumentEntity> {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" not allowed. Allowed: PDF, PNG, JPG, XLSX, XLS, ZIP, DOC, DOCX`,
      );
    }

    // Verify branch belongs to client
    const branchCheck = await this.repo.manager.query(
      `SELECT id FROM client_branches WHERE id = $1 AND clientid = $2 AND (deletedat IS NULL)`,
      [dto.branchId, clientId],
    );
    if (!branchCheck?.length) {
      throw new BadRequestException('Branch does not belong to your client');
    }

    // If masterDocumentId provided, look up defaults
    let masterDefaults: {
      category?: string;
      frequency?: string;
      applicableTo?: string;
      isMandatory?: boolean;
    } = {};
    if (dto.masterDocumentId) {
      const [master] = await this.repo.manager.query(
        `SELECT document_name, category, frequency, applicable_to, is_mandatory FROM safety_document_master WHERE id = $1`,
        [dto.masterDocumentId],
      );
      if (master) {
        masterDefaults = {
          category: master.category,
          frequency: master.frequency,
          applicableTo: master.applicable_to,
          isMandatory: master.is_mandatory,
        };
      }
    }

    // Build path: uploads/safety-documents/{clientId}/{branchId}/...
    const dir = path.join(
      process.cwd(),
      'uploads',
      'safety-documents',
      clientId,
      dto.branchId,
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

    const doc = this.repo.create({
      branchId: dto.branchId,
      clientId,
      documentType: dto.documentType,
      documentName: dto.documentName,
      fileName: file.originalname,
      filePath: relativePath,
      mimeType: file.mimetype,
      fileSize: file.size || file.buffer.length,
      validFrom: dto.validFrom || null,
      validTo: dto.validTo || null,
      remarks: dto.remarks || null,
      uploadedBy: userId,
      status: 'ACTIVE',
      // v2 fields
      category: dto.category || masterDefaults.category || null,
      frequency: dto.frequency || masterDefaults.frequency || null,
      applicableTo: dto.applicableTo || masterDefaults.applicableTo || 'ALL',
      periodMonth: dto.periodMonth || null,
      periodQuarter: dto.periodQuarter || null,
      periodYear: dto.periodYear || null,
      isMandatory: masterDefaults.isMandatory || false,
      masterDocumentId: dto.masterDocumentId || null,
    });

    return this.repo.save(doc);
  }

  /* ═══════════════════════════════════════════════════
     Branch user: List own documents
     ═══════════════════════════════════════════════════ */

  async listForBranch(
    branchIds: string[],
    filters: { documentType?: string; category?: string; frequency?: string },
  ): Promise<SafetyDocumentEntity[]> {
    const qb = this.repo
      .createQueryBuilder('sd')
      .where('sd.is_deleted = false')
      .andWhere('sd.branch_id IN (:...branchIds)', { branchIds })
      .orderBy('sd.created_at', 'DESC');

    if (filters.documentType) {
      qb.andWhere('sd.document_type = :dt', { dt: filters.documentType });
    }
    if (filters.category) {
      qb.andWhere('sd.category = :cat', { cat: filters.category });
    }
    if (filters.frequency) {
      qb.andWhere('sd.frequency = :freq', { freq: filters.frequency });
    }

    return qb.getMany();
  }

  /* ═══════════════════════════════════════════════════
     Branch user: Delete own document
     ═══════════════════════════════════════════════════ */

  async deleteBranch(docId: string, _userId: string, branchIds: string[]) {
    const doc = await this.repo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (!branchIds.includes(doc.branchId)) {
      throw new ForbiddenException(
        'Cannot delete documents from other branches',
      );
    }

    doc.isDeleted = true;
    doc.status = 'DELETED';
    await this.repo.save(doc);
    return { success: true };
  }

  /* ═══════════════════════════════════════════════════
     Client user: List across all branches
     ═══════════════════════════════════════════════════ */

  async listForClient(
    clientId: string,
    filters: {
      branchId?: string;
      documentType?: string;
      category?: string;
      frequency?: string;
    },
  ): Promise<any[]> {
    const qb = this.repo
      .createQueryBuilder('sd')
      .leftJoin('client_branches', 'cb', 'cb.id = sd.branch_id')
      .select([
        'sd.id AS id',
        'sd.branch_id AS "branchId"',
        'cb.branchname AS "branchName"',
        'sd.document_type AS "documentType"',
        'sd.document_name AS "documentName"',
        'sd.file_name AS "fileName"',
        'sd.mime_type AS "mimeType"',
        'sd.file_size AS "fileSize"',
        'sd.valid_from AS "validFrom"',
        'sd.valid_to AS "validTo"',
        'sd.status AS status',
        'sd.remarks AS remarks',
        'sd.category AS category',
        'sd.frequency AS frequency',
        'sd.applicable_to AS "applicableTo"',
        'sd.period_month AS "periodMonth"',
        'sd.period_quarter AS "periodQuarter"',
        'sd.period_year AS "periodYear"',
        'sd.is_mandatory AS "isMandatory"',
        'sd.verified_by_crm AS "verifiedByCrm"',
        'sd.crm_verified_at AS "crmVerifiedAt"',
        'sd.verified_by_auditor AS "verifiedByAuditor"',
        'sd.auditor_verified_at AS "auditorVerifiedAt"',
        'sd.created_at AS "createdAt"',
      ])
      .where('sd.is_deleted = false')
      .andWhere('sd.client_id = :clientId', { clientId })
      .orderBy('sd.created_at', 'DESC');

    if (filters.branchId) {
      qb.andWhere('sd.branch_id = :branchId', { branchId: filters.branchId });
    }
    if (filters.documentType) {
      qb.andWhere('sd.document_type = :dt', { dt: filters.documentType });
    }
    if (filters.category) {
      qb.andWhere('sd.category = :cat', { cat: filters.category });
    }
    if (filters.frequency) {
      qb.andWhere('sd.frequency = :freq', { freq: filters.frequency });
    }

    return qb.getRawMany();
  }

  /* ═══════════════════════════════════════════════════
     CRM: List for assigned clients
     ═══════════════════════════════════════════════════ */

  async listForCrm(
    clientId: string,
    filters: {
      branchId?: string;
      documentType?: string;
      category?: string;
      frequency?: string;
    },
  ): Promise<any[]> {
    return this.listForClient(clientId, filters);
  }

  /* ═══════════════════════════════════════════════════
     CRM / Auditor: Verify a document
     ═══════════════════════════════════════════════════ */

  async verifyCrm(docId: string, userId: string): Promise<any> {
    const doc = await this.repo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');
    doc.verifiedByCrm = true;
    doc.crmVerifiedAt = new Date();
    doc.crmVerifiedBy = userId;
    await this.repo.save(doc);
    return { success: true };
  }

  async verifyAuditor(docId: string, userId: string): Promise<any> {
    const doc = await this.repo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');
    doc.verifiedByAuditor = true;
    doc.auditorVerifiedAt = new Date();
    doc.auditorVerifiedBy = userId;
    await this.repo.save(doc);
    return { success: true };
  }

  /* ═══════════════════════════════════════════════════
     Download
     ═══════════════════════════════════════════════════ */

  async getDocumentForDownload(docId: string): Promise<{
    absolutePath: string;
    fileName: string;
    mimeType: string;
  }> {
    const doc = await this.repo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');

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

  async getDocumentEntity(docId: string): Promise<SafetyDocumentEntity> {
    const doc = await this.repo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /* ═══════════════════════════════════════════════════
     Safety Risk Score
     ═══════════════════════════════════════════════════ */

  async getSafetyScore(scope: {
    branchIds?: string[];
    clientId?: string;
  }): Promise<{
    overallScore: number;
    categoryScores: {
      category: string;
      weight: number;
      uploaded: number;
      required: number;
      score: number;
    }[];
  }> {
    // Get applicable master documents
    const masterRows = await this.repo.manager.query(
      `SELECT category, COUNT(*) as total FROM safety_document_master WHERE is_active = true AND is_mandatory = true GROUP BY category`,
    );

    // Count uploaded documents per category (current year)
    const currentYear = new Date().getFullYear();
    let uploadedSql = `
      SELECT category, COUNT(DISTINCT document_type) as uploaded
      FROM safety_documents
      WHERE is_deleted = false AND category IS NOT NULL
        AND (period_year = $1 OR EXTRACT(YEAR FROM created_at) = $1)
    `;
    const params: unknown[] = [currentYear];
    let pIdx = 2;

    if (scope.branchIds?.length) {
      uploadedSql += ` AND branch_id IN (${scope.branchIds.map(() => `$${pIdx++}`).join(',')})`;
      params.push(...scope.branchIds);
    }
    if (scope.clientId) {
      uploadedSql += ` AND client_id = $${pIdx++}`;
      params.push(scope.clientId);
    }
    uploadedSql += ` GROUP BY category`;

    const uploadedRows = await this.repo.manager.query(uploadedSql, params);
    const uploadedMap: Record<string, number> = {};
    for (const r of uploadedRows) {
      uploadedMap[r.category] = parseInt(r.uploaded, 10);
    }

    let overallScore = 0;
    const categoryScores: {
      category: string;
      weight: number;
      uploaded: number;
      required: number;
      score: number;
    }[] = [];

    for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      const masterRow = masterRows.find((r) => r.category === category);
      const required = masterRow ? parseInt(masterRow.total, 10) : 0;
      const uploaded = uploadedMap[category] || 0;
      const catScore =
        required > 0
          ? Math.min(100, Math.round((uploaded / required) * 100))
          : 100;

      categoryScores.push({
        category,
        weight: Math.round(weight * 100),
        uploaded,
        required,
        score: catScore,
      });
      overallScore += catScore * weight;
    }

    return { overallScore: Math.round(overallScore), categoryScores };
  }

  /* ═══════════════════════════════════════════════════
     Expiry check (cron)
     ═══════════════════════════════════════════════════ */

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkExpiringSafetyDocuments(): Promise<void> {
    this.logger.log('Checking for expiring safety documents...');

    const today = new Date();
    const in30Days = new Date();
    in30Days.setDate(today.getDate() + 30);

    // Find documents expiring within 30 days
    const expiring = await this.repo
      .createQueryBuilder('sd')
      .where('sd.is_deleted = false')
      .andWhere('sd.valid_to IS NOT NULL')
      .andWhere('sd.valid_to <= :in30Days', {
        in30Days: in30Days.toISOString().slice(0, 10),
      })
      .andWhere('sd.valid_to >= :today', {
        today: today.toISOString().slice(0, 10),
      })
      .getMany();

    if (!expiring.length) {
      this.logger.log('No safety documents expiring in the next 30 days.');
      return;
    }

    this.logger.log(
      `Found ${expiring.length} safety document(s) expiring within 30 days.`,
    );

    for (const doc of expiring) {
      const daysUntilExpiry = Math.ceil(
        (new Date(doc.validTo!).getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      // Only create notification at 30, 15, 7, 3, 1 day milestones
      if (![30, 15, 7, 3, 1].includes(daysUntilExpiry)) continue;

      const message =
        daysUntilExpiry === 1
          ? `Safety document "${doc.documentName}" (${doc.documentType}) expires TOMORROW!`
          : `Safety document "${doc.documentName}" (${doc.documentType}) expires in ${daysUntilExpiry} days.`;

      // Insert notifications for the branch user who uploaded + client + CRM
      try {
        await this.repo.manager.query(
          `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'SAFETY_EXPIRY', false, NOW())
           ON CONFLICT DO NOTHING`,
          [doc.uploadedBy, 'Safety Document Expiry', message],
        );

        // Also notify for client role users of this client
        await this.repo.manager.query(
          `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
           SELECT gen_random_uuid(), u.id, $1, $2, 'SAFETY_EXPIRY', false, NOW()
           FROM users u
           WHERE u.clientid = $3 AND u.role = 'CLIENT' AND u.isactive = true
           ON CONFLICT DO NOTHING`,
          ['Safety Document Expiry', message, doc.clientId],
        );

        // Notify CRM assigned to this client
        await this.repo.manager.query(
          `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
           SELECT gen_random_uuid(), u.id, $1, $2, 'SAFETY_EXPIRY', false, NOW()
           FROM users u
           JOIN client_assignment_current cac ON cac.assigned_to_user_id = u.id
           WHERE cac.client_id = $3 AND cac.assignment_type = 'CRM'
           ON CONFLICT DO NOTHING`,
          ['Safety Document Expiry', message, doc.clientId],
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to insert expiry notification for doc ${doc.id}: ${err.message}`,
        );
      }
    }
  }

  /* ═══════════════════════════════════════════════════
     Get expiring docs for the popup banner
     ═══════════════════════════════════════════════════ */

  async getExpiringDocuments(
    scope: { branchIds?: string[]; clientId?: string },
    daysAhead = 30,
  ): Promise<any[]> {
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const future = futureDate.toISOString().slice(0, 10);

    const qb = this.repo
      .createQueryBuilder('sd')
      .leftJoin('client_branches', 'cb', 'cb.id = sd.branch_id')
      .select([
        'sd.id AS id',
        'sd.document_type AS "documentType"',
        'sd.document_name AS "documentName"',
        'sd.valid_to AS "validTo"',
        'sd.category AS category',
        'cb.branchname AS "branchName"',
        `EXTRACT(DAY FROM sd.valid_to::timestamp - NOW()) AS "daysRemaining"`,
      ])
      .where('sd.is_deleted = false')
      .andWhere('sd.valid_to IS NOT NULL')
      .andWhere('sd.valid_to >= :today', { today })
      .andWhere('sd.valid_to <= :future', { future })
      .orderBy('sd.valid_to', 'ASC');

    if (scope.branchIds?.length) {
      qb.andWhere('sd.branch_id IN (:...branchIds)', {
        branchIds: scope.branchIds,
      });
    }
    if (scope.clientId) {
      qb.andWhere('sd.client_id = :clientId', { clientId: scope.clientId });
    }

    return qb.getRawMany();
  }
}
