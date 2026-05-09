import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  ComplianceDocLibraryEntity,
  DocumentCategory,
} from './entities/compliance-document.entity';
import { ComplianceDocumentVisibilityEntity } from './entities/compliance-document-visibility.entity';
import { CompanySettingsEntity } from './entities/company-settings.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import { UploadComplianceDocumentDto } from './dto/upload-compliance-document.dto';
import { ListComplianceDocumentsDto } from './dto/list-compliance-documents.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import * as fs from 'fs';
import * as path from 'path';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
};

@Injectable()
export class ComplianceDocumentsService {
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
  ]);

  constructor(
    @InjectRepository(ComplianceDocLibraryEntity)
    private readonly docRepo: Repository<ComplianceDocLibraryEntity>,
    @InjectRepository(ComplianceDocumentVisibilityEntity)
    private readonly _visibilityRepo: Repository<ComplianceDocumentVisibilityEntity>,
    @InjectRepository(CompanySettingsEntity)
    private readonly settingsRepo: Repository<CompanySettingsEntity>,
    @InjectRepository(ClientAssignmentCurrentEntity)
    private readonly assignmentsRepo: Repository<ClientAssignmentCurrentEntity>,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // ══════════════════════════════════════════════════════════
  // UPLOAD (CRM / Admin)
  // ══════════════════════════════════════════════════════════
  async upload(
    dto: UploadComplianceDocumentDto,
    file: UploadedFile,
    userId: string,
    role: string,
  ): Promise<ComplianceDocLibraryEntity> {
    if (!file?.buffer) throw new BadRequestException('File is required');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed`,
      );
    }

    // Save file to disk
    const safeCategory = (dto.category || 'GENERAL').replace(/[^A-Za-z_]/g, '');
    const dir = path.join(
      process.cwd(),
      'uploads',
      'compliance-docs',
      dto.clientId,
      safeCategory,
    );
    fs.mkdirSync(dir, { recursive: true });

    const ts = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskName = `${ts}_${safeName}`;
    const filePath = path.join(dir, diskName);
    fs.writeFileSync(filePath, file.buffer);

    // Build relative path
    const relativePath = path.relative(
      path.join(process.cwd(), 'uploads'),
      filePath,
    );

    const doc = this.docRepo.create({
      clientId: dto.clientId,
      branchId: dto.branchId || null,
      category: dto.category as DocumentCategory,
      subCategory: dto.subCategory || null,
      title: dto.title,
      description: dto.description || null,
      filePath: relativePath,
      fileName: file.originalname,
      fileSize: file.size || file.buffer.length,
      mimeType: file.mimetype,
      periodYear: dto.periodYear || null,
      periodMonth: dto.periodMonth || null,
      periodLabel: dto.periodLabel || null,
      uploadedBy: userId,
      uploadedRole: role,
    });

    return this.docRepo.save(doc);
  }

  // ══════════════════════════════════════════════════════════
  // LIST — CLIENT (Master or Branch user)
  // ══════════════════════════════════════════════════════════
  async listForClient(
    clientId: string,
    userId: string,
    filters: ListComplianceDocumentsDto,
  ): Promise<ComplianceDocLibraryEntity[]> {
    const isMaster = await this.branchAccess.isMasterUser(userId);
    const qb = this.baseQuery(clientId, filters);

    if (!isMaster) {
      // Branch user: filter by allowed branches + company-level docs (branchId IS NULL)
      const branchIds = await this.branchAccess.getUserBranchIds(userId);
      if (branchIds.length === 0) {
        return []; // no branches assigned — see nothing
      }
      qb.andWhere(
        '(doc.branch_id IN (:...branchIds) OR doc.branch_id IS NULL)',
        { branchIds },
      );

      // Apply wage/salary register restrictions
      await this.applyRegisterRestrictions(qb, clientId);
    }

    // Apply category filter
    if (filters.category) {
      qb.andWhere('doc.category = :category', { category: filters.category });
    }

    return qb.orderBy('doc.created_at', 'DESC').getMany();
  }

  // ══════════════════════════════════════════════════════════
  // LIST — CRM
  // ══════════════════════════════════════════════════════════
  async listForCrm(
    crmUserId: string,
    filters: ListComplianceDocumentsDto,
  ): Promise<ComplianceDocLibraryEntity[]> {
    // CRM sees docs of assigned clients only
    const clientId = filters.clientId;
    if (!clientId) throw new BadRequestException('clientId is required');

    // Verify CRM has this client assigned
    const assignment = await this.assignmentsRepo.findOne({
      where: { assignedToUserId: crmUserId, clientId },
    });
    if (!assignment)
      throw new ForbiddenException('Not assigned to this client');

    const qb = this.baseQuery(clientId, filters);
    if (filters.category) {
      qb.andWhere('doc.category = :category', { category: filters.category });
    }
    return qb.orderBy('doc.created_at', 'DESC').getMany();
  }

  // ══════════════════════════════════════════════════════════
  // LIST — ADMIN (sees everything for a client)
  // ══════════════════════════════════════════════════════════
  async listForAdmin(
    filters: ListComplianceDocumentsDto,
  ): Promise<ComplianceDocLibraryEntity[]> {
    const clientId = filters.clientId;
    if (!clientId) throw new BadRequestException('clientId is required');
    const qb = this.baseQuery(clientId, filters);
    if (filters.category) {
      qb.andWhere('doc.category = :category', { category: filters.category });
    }
    return qb.orderBy('doc.created_at', 'DESC').getMany();
  }

  // ══════════════════════════════════════════════════════════
  // DOWNLOAD — with access check
  // ══════════════════════════════════════════════════════════
  async getDocumentForDownload(
    docId: string,
    userId: string,
    userRole: string,
    clientId?: string,
  ): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const doc = await this.docRepo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // Role-based access
    if (userRole === 'CLIENT') {
      if (doc.clientId !== clientId)
        throw new ForbiddenException('Access denied');
      const isMaster = await this.branchAccess.isMasterUser(userId);
      if (!isMaster) {
        // Branch user checks
        const branchIds = await this.branchAccess.getUserBranchIds(userId);
        if (doc.branchId && !branchIds.includes(doc.branchId)) {
          throw new ForbiddenException('Access denied to this branch document');
        }
        // Check register restrictions
        if (doc.category === 'REGISTER') {
          const blocked = await this.isRegisterBlockedForBranchUser(
            doc,
            clientId,
          );
          if (blocked)
            throw new ForbiddenException(
              'Access to this register is restricted by company settings',
            );
        }
      }
    } else if (userRole === 'CRM') {
      const assignment = await this.assignmentsRepo.findOne({
        where: { assignedToUserId: userId, clientId: doc.clientId },
      });
      if (!assignment)
        throw new ForbiddenException('Not assigned to this client');
    }
    // ADMIN can download anything

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

  // ══════════════════════════════════════════════════════════
  // SOFT DELETE
  // ══════════════════════════════════════════════════════════
  async softDelete(docId: string, userId: string): Promise<void> {
    const doc = await this.docRepo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.deletedBy = userId;
    await this.docRepo.save(doc);
  }

  // ══════════════════════════════════════════════════════════
  // COMPANY SETTINGS
  // ══════════════════════════════════════════════════════════
  async getCompanySettings(clientId: string): Promise<Record<string, unknown>> {
    const row = await this.settingsRepo.findOne({ where: { clientId } });
    return (
      row?.settings || {
        allowBranchWageRegisters: true,
        allowBranchSalaryRegisters: true,
      }
    );
  }

  async updateCompanySettings(
    clientId: string,
    userId: string,
    dto: UpdateCompanySettingsDto,
  ): Promise<Record<string, unknown>> {
    let row = await this.settingsRepo.findOne({ where: { clientId } });
    if (!row) {
      row = this.settingsRepo.create({
        clientId,
        settings: {
          allowBranchWageRegisters: true,
          allowBranchSalaryRegisters: true,
        },
        updatedBy: userId,
      });
    }
    // Merge settings
    if (dto.allowBranchWageRegisters !== undefined) {
      row.settings = {
        ...row.settings,
        allowBranchWageRegisters: dto.allowBranchWageRegisters,
      };
    }
    if (dto.allowBranchSalaryRegisters !== undefined) {
      row.settings = {
        ...row.settings,
        allowBranchSalaryRegisters: dto.allowBranchSalaryRegisters,
      };
    }
    row.updatedBy = userId;
    const saved = await this.settingsRepo.save(row);
    return saved.settings;
  }

  // ══════════════════════════════════════════════════════════
  // CATEGORY CATALOG
  // ══════════════════════════════════════════════════════════
  getCategories() {
    return [
      { code: 'RETURN', label: 'Returns / Filings' },
      { code: 'REGISTER', label: 'Registers' },
      { code: 'LICENSE', label: 'Licenses' },
      { code: 'MCD', label: 'Monthly Compliance Docket' },
      { code: 'AUDIT_REPORT', label: 'Audit Reports' },
    ];
  }

  getSubCategories(category: string) {
    const map: Record<string, { code: string; label: string }[]> = {
      RETURN: [
        { code: 'PF', label: 'PF Monthly Return' },
        { code: 'ESI', label: 'ESI Monthly Return' },
        { code: 'PT', label: 'Professional Tax' },
        { code: 'LWF', label: 'Labour Welfare Fund' },
        { code: 'GST', label: 'GST Return' },
        { code: 'TDS', label: 'TDS Return' },
        { code: 'ROC', label: 'ROC Filings' },
      ],
      REGISTER: [
        { code: 'WAGE', label: 'Wage Register' },
        { code: 'SALARY', label: 'Salary Register' },
        { code: 'ATTENDANCE', label: 'Attendance Register' },
        { code: 'LEAVE', label: 'Leave Register' },
        { code: 'BONUS', label: 'Bonus Register' },
        { code: 'MUSTER_ROLL', label: 'Muster Roll' },
      ],
      LICENSE: [
        { code: 'SHOPS', label: 'Shops & Establishment' },
        { code: 'FACTORY', label: 'Factory License' },
        { code: 'CLRA', label: 'CLRA License' },
        { code: 'TRADE', label: 'Trade License' },
        { code: 'GST_REG', label: 'GST Registration' },
        { code: 'PF_REG', label: 'PF Registration' },
        { code: 'ESI_REG', label: 'ESI Registration' },
      ],
      MCD: [{ code: 'MCD', label: 'Monthly Compliance Docket' }],
      AUDIT_REPORT: [
        { code: 'INTERNAL', label: 'Internal Audit Report' },
        { code: 'STATUTORY', label: 'Statutory Audit Report' },
        { code: 'COMPLIANCE', label: 'Compliance Audit Report' },
      ],
    };
    return map[category] || [];
  }

  // ──────── Private helpers ────────

  private baseQuery(
    clientId: string,
    filters: ListComplianceDocumentsDto,
  ): SelectQueryBuilder<ComplianceDocLibraryEntity> {
    const qb = this.docRepo
      .createQueryBuilder('doc')
      .where('doc.client_id = :clientId', { clientId })
      .andWhere('doc.is_deleted = false');

    if (filters.branchId) {
      qb.andWhere('doc.branch_id = :branchId', { branchId: filters.branchId });
    }
    if (filters.subCategory) {
      qb.andWhere('doc.sub_category = :subCategory', {
        subCategory: filters.subCategory,
      });
    }
    if (filters.periodYear) {
      qb.andWhere('doc.period_year = :periodYear', {
        periodYear: filters.periodYear,
      });
    }
    if (filters.periodMonth) {
      qb.andWhere('doc.period_month = :periodMonth', {
        periodMonth: filters.periodMonth,
      });
    }
    if (filters.search) {
      qb.andWhere(
        '(doc.title ILIKE :search OR doc.description ILIKE :search)',
        {
          search: `%${filters.search}%`,
        },
      );
    }
    return qb;
  }

  private async applyRegisterRestrictions(
    qb: SelectQueryBuilder<ComplianceDocLibraryEntity>,
    clientId: string,
  ): Promise<void> {
    const settings = await this.getCompanySettings(clientId);
    const blockedSubs: string[] = [];
    if (!settings.allowBranchWageRegisters) blockedSubs.push('WAGE');
    if (!settings.allowBranchSalaryRegisters) blockedSubs.push('SALARY');

    if (blockedSubs.length > 0) {
      qb.andWhere(
        `NOT (doc.category = 'REGISTER' AND doc.sub_category IN (:...blockedSubs))`,
        { blockedSubs },
      );
    }
  }

  private async isRegisterBlockedForBranchUser(
    doc: ComplianceDocLibraryEntity,
    clientId: string,
  ): Promise<boolean> {
    if (doc.category !== 'REGISTER') return false;
    const settings = await this.getCompanySettings(clientId);
    if (doc.subCategory === 'WAGE' && !settings.allowBranchWageRegisters)
      return true;
    if (doc.subCategory === 'SALARY' && !settings.allowBranchSalaryRegisters)
      return true;
    return false;
  }
}
