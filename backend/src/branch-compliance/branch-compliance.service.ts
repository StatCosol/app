import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ComplianceDocumentEntity,
  ComplianceDocStatus,
} from './entities/compliance-document.entity';
import { ComplianceReturnMasterEntity } from './entities/compliance-return-master.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import {
  UploadComplianceDocDto,
  MarkNotApplicableDto,
  ReviewComplianceDocDto,
  ChecklistQueryDto,
  ReturnMasterQueryDto,
  CreateReturnMasterDto,
  UpdateReturnMasterDto,
} from './dto/branch-compliance.dto';
import * as fs from 'fs';
import * as path from 'path';
import { ReqUser } from '../access/access-scope.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RejectionMailService } from '../email/rejection-mail.service';

type UploadedFile = { originalname: string; buffer: Buffer; mimetype: string };

type ReturnMasterSeed = {
  returnCode: string;
  returnName: string;
  lawArea: string;
  frequency: string;
  scopeDefault: string;
  applicableFor: string;
  dueDay: number | null;
  category: string | null;
  stateCode: string;
  appliesTo: string;
  uploadRequired: boolean;
  dueDateRule: string | null;
  riskLevel: string;
  responsibleRole: string;
  remarks: string | null;
  isActive?: boolean;
};

const STATE_COMBINED_RETURN_SEEDS: ReturnMasterSeed[] = [
  {
    returnCode: 'TS_INTEGRATED_ANNUAL',
    returnName: 'Telangana Integrated Annual Return',
    lawArea: 'Multiple Labour Laws (TS)',
    frequency: 'YEARLY',
    scopeDefault: 'CLIENT',
    applicableFor: 'BOTH',
    dueDay: 31,
    category: 'COMBINED_RETURN',
    stateCode: 'TS',
    appliesTo: 'BOTH',
    uploadRequired: true,
    dueDateRule: 'BEFORE_31_JAN',
    riskLevel: 'HIGH',
    responsibleRole: 'CRM',
    remarks:
      'Single combined annual return covering: Minimum Wages, Payment of Wages, Bonus, Maternity Benefit, Equal Remuneration. Does NOT cover PF, ESI, CLRA, Factories Act',
  },
  {
    returnCode: 'AP_COMBINED_ANNUAL',
    returnName: 'Andhra Pradesh Combined Annual Return',
    lawArea: 'Multiple Labour Laws (AP)',
    frequency: 'YEARLY',
    scopeDefault: 'CLIENT',
    applicableFor: 'BOTH',
    dueDay: 31,
    category: 'COMBINED_RETURN',
    stateCode: 'AP',
    appliesTo: 'BOTH',
    uploadRequired: true,
    dueDateRule: 'BEFORE_31_JAN',
    riskLevel: 'HIGH',
    responsibleRole: 'CRM',
    remarks:
      'Combined annual return covering Minimum Wages, Payment of Wages, Bonus, Maternity Benefit, Equal Remuneration. Format differs from Telangana but scope is similar',
  },
  {
    returnCode: 'KA_UNIFIED_ANNUAL',
    returnName: 'Karnataka Unified Annual Return',
    lawArea: 'Multiple Labour Laws (KA)',
    frequency: 'YEARLY',
    scopeDefault: 'CLIENT',
    applicableFor: 'BOTH',
    dueDay: 31,
    category: 'COMBINED_RETURN',
    stateCode: 'KA',
    appliesTo: 'BOTH',
    uploadRequired: true,
    dueDateRule: 'BEFORE_31_JAN',
    riskLevel: 'HIGH',
    responsibleRole: 'CRM',
    remarks:
      'Karnataka state combined annual return under the Simplified Compliance Act',
  },
  {
    returnCode: 'MH_COMBINED_ANNUAL',
    returnName: 'Maharashtra Combined Annual Return',
    lawArea: 'Multiple Labour Laws (MH)',
    frequency: 'YEARLY',
    scopeDefault: 'CLIENT',
    applicableFor: 'BOTH',
    dueDay: 31,
    category: 'COMBINED_RETURN',
    stateCode: 'MH',
    appliesTo: 'BOTH',
    uploadRequired: true,
    dueDateRule: 'BEFORE_31_JAN',
    riskLevel: 'HIGH',
    responsibleRole: 'CRM',
    remarks:
      'Maharashtra state combined annual return under the Labour Laws (Exemption) Act',
  },
  {
    returnCode: 'TN_CONSOLIDATED_ANNUAL',
    returnName: 'Tamil Nadu Consolidated Annual Return',
    lawArea: 'Multiple Labour Laws (TN)',
    frequency: 'YEARLY',
    scopeDefault: 'CLIENT',
    applicableFor: 'BOTH',
    dueDay: 31,
    category: 'COMBINED_RETURN',
    stateCode: 'TN',
    appliesTo: 'BOTH',
    uploadRequired: true,
    dueDateRule: 'BEFORE_31_JAN',
    riskLevel: 'HIGH',
    responsibleRole: 'CRM',
    remarks:
      'Tamil Nadu state consolidated annual return covering applicable labour laws',
  },
];

@Injectable()
export class BranchComplianceService {
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ]);

  constructor(
    @InjectRepository(ComplianceDocumentEntity)
    private readonly docRepo: Repository<ComplianceDocumentEntity>,
    @InjectRepository(ComplianceReturnMasterEntity)
    private readonly masterRepo: Repository<ComplianceReturnMasterEntity>,
    private readonly branchAccess: BranchAccessService,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
    private readonly rejectionMail: RejectionMailService,
  ) {}

  private normalizeStateCode(
    value: string | null | undefined,
  ): string | undefined {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (!normalized) return undefined;

    switch (normalized) {
      case 'TG':
      case 'TS':
      case 'TELANGANA':
      case 'TELANGANASTATE':
        return 'TS';
      case 'AP':
      case 'ANDHRAPRADESH':
      case 'ANDHRA':
        return 'AP';
      case 'TN':
      case 'TAMILNADU':
      case 'TAMILNADUSTATE':
        return 'TN';
      case 'KA':
      case 'KARNATAKA':
        return 'KA';
      case 'MH':
      case 'MAHARASHTRA':
        return 'MH';
      case 'GJ':
      case 'GUJARAT':
        return 'GJ';
      case 'KL':
      case 'KERALA':
        return 'KL';
      case 'DL':
      case 'DELHI':
      case 'NEWDELHI':
      case 'NCR':
        return 'DL';
      case 'RJ':
      case 'RAJASTHAN':
        return 'RJ';
      case 'UP':
      case 'UTTARPRADESH':
        return 'UP';
      case 'MP':
      case 'MADHYAPRADESH':
        return 'MP';
      case 'WB':
      case 'WESTBENGAL':
        return 'WB';
      case 'OD':
      case 'OR':
      case 'ORISSA':
      case 'ODISHA':
        return 'OD';
      case 'HR':
      case 'HARYANA':
        return 'HR';
      case 'PB':
      case 'PUNJAB':
        return 'PB';
      case 'BR':
      case 'BIHAR':
        return 'BR';
      case 'JH':
      case 'JHARKHAND':
        return 'JH';
      case 'CG':
      case 'CT':
      case 'CHHATTISGARH':
      case 'CHHATTISGAR':
        return 'CG';
      case 'UK':
      case 'UT':
      case 'UTTARAKHAND':
      case 'UTTARANCHAL':
        return 'UK';
      default:
        return normalized;
    }
  }

  private async ensureCombinedReturnMasters(): Promise<void> {
    for (const seed of STATE_COMBINED_RETURN_SEEDS) {
      await this.masterRepo.save(
        this.masterRepo.create({
          ...seed,
          isActive: seed.isActive ?? true,
        }),
      );
    }
  }

  // ─── Return Master CRUD ────────────────────────────────────

  async getReturnMaster(q: ReturnMasterQueryDto) {
    await this.ensureCombinedReturnMasters();

    const qb = this.masterRepo.createQueryBuilder('m');

    if (q.frequency) qb.andWhere('m.frequency = :freq', { freq: q.frequency });
    if (q.applicableFor)
      qb.andWhere('m.applicable_for IN (:...af)', {
        af: [q.applicableFor, 'BOTH'],
      });
    if (q.lawArea) qb.andWhere('m.law_area = :la', { la: q.lawArea });
    if (q.category) qb.andWhere('m.category = :cat', { cat: q.category });
    if (q.appliesTo)
      qb.andWhere("(m.applies_to = :at OR m.applies_to = 'BOTH')", {
        at: q.appliesTo,
      });
    const normalizedStateCode = this.normalizeStateCode(q.stateCode);
    if (normalizedStateCode)
      qb.andWhere("(m.state_code = 'ALL' OR m.state_code = :sc)", {
        sc: normalizedStateCode,
      });
    if (q.responsibleRole)
      qb.andWhere('m.responsible_role = :rr', { rr: q.responsibleRole });
    if (q.riskLevel) qb.andWhere('m.risk_level = :rl', { rl: q.riskLevel });
    if (q.isActive !== undefined)
      qb.andWhere('m.is_active = :active', { active: q.isActive });

    qb.orderBy('m.category', 'ASC').addOrderBy('m.return_name', 'ASC');

    return qb.getMany();
  }

  async createReturnMaster(dto: CreateReturnMasterDto) {
    const existing = await this.masterRepo.findOne({
      where: { returnCode: dto.returnCode },
    });
    if (existing)
      throw new BadRequestException(
        `Return code ${dto.returnCode} already exists`,
      );

    const entity = this.masterRepo.create({
      returnCode: dto.returnCode,
      returnName: dto.returnName,
      lawArea: dto.lawArea,
      frequency: dto.frequency,
      scopeDefault: dto.scopeDefault || 'BRANCH',
      applicableFor: dto.applicableFor || 'BOTH',
      dueDay: dto.dueDay ?? null,
      category: dto.category ?? null,
      stateCode: dto.stateCode || 'ALL',
      appliesTo: dto.appliesTo || 'BRANCH',
      uploadRequired: dto.uploadRequired ?? true,
      dueDateRule: dto.dueDateRule ?? null,
      riskLevel: dto.riskLevel || 'MEDIUM',
      responsibleRole: dto.responsibleRole || 'BRANCH_USER',
      remarks: dto.remarks ?? null,
    });
    return this.masterRepo.save(entity);
  }

  async updateReturnMaster(returnCode: string, dto: UpdateReturnMasterDto) {
    const entity = await this.masterRepo.findOne({ where: { returnCode } });
    if (!entity)
      throw new NotFoundException(`Return code ${returnCode} not found`);

    Object.assign(entity, dto);
    return this.masterRepo.save(entity);
  }

  // ─── Checklist (Branch User) ───────────────────────────────

  async getChecklist(user: ReqUser, q: ChecklistQueryDto) {
    const branchId = await this.resolveBranchId(user, q.branchId);

    await this.assertBranchAccess(user, branchId);

    const companyId = q.companyId || user.clientId;
    const year = q.year || new Date().getFullYear();
    const frequency = q.frequency || 'MONTHLY';

    // Resolve the branch state code and type for state-based filtering
    const branchRows = await this.dataSource.query(
      `SELECT statecode, branchtype FROM client_branches WHERE id = $1 LIMIT 1`,
      [branchId],
    );
    const branchRow = branchRows.length ? branchRows[0] : null;

    // Gate factory compliance: branch must be FACTORY type
    const branchType = String(branchRow?.branchtype || '').toUpperCase();
    if (q.appliesTo === 'FACTORY' && branchType !== 'FACTORY') {
      return {
        data: [],
        total: 0,
        message:
          'Factory compliance items are only available for factory-type branches.',
      };
    }
    // Gate office compliance: branch must NOT be FACTORY type
    if (q.appliesTo === 'OFFICE' && branchType === 'FACTORY') {
      return {
        data: [],
        total: 0,
        message:
          'Office compliance items are only available for office / establishment branches.',
      };
    }

    let branchStateCode: string | undefined = this.normalizeStateCode(
      q.stateCode,
    );
    if (!branchStateCode && branchRow?.statecode) {
      branchStateCode = this.normalizeStateCode(branchRow.statecode);
    }

    // Get master list filtered by branch type and state
    let masterItems = await this.getReturnMaster({
      frequency,
      isActive: true,
      lawArea: q.lawArea,
      category: q.category,
      appliesTo: q.appliesTo,
      stateCode: branchStateCode,
    });

    // When no explicit appliesTo filter (e.g. MCD page), exclude items
    // meant for the other branch type so FACTORY branches don't see
    // OFFICE items and vice-versa.
    if (!q.appliesTo && branchType) {
      const exclude = branchType === 'FACTORY' ? 'OFFICE' : 'FACTORY';
      masterItems = masterItems.filter((m) => m.appliesTo !== exclude);
    }

    if (!masterItems.length) {
      return {
        data: [],
        total: 0,
        message:
          'No compliance items configured for this frequency. Please contact admin.',
      };
    }

    // Get existing documents for this branch + period
    const docsQb = this.docRepo
      .createQueryBuilder('d')
      .where('d.branch_id = :branchId', { branchId })
      .andWhere('d.company_id = :companyId', { companyId })
      .andWhere('d.period_year = :year', { year })
      .andWhere('d.frequency = :frequency', { frequency });

    if (frequency === 'MONTHLY' && q.month) {
      docsQb.andWhere('d.period_month = :month', { month: q.month });
    }
    if (frequency === 'QUARTERLY' && q.quarter) {
      docsQb.andWhere('d.period_quarter = :quarter', { quarter: q.quarter });
    }
    if (frequency === 'HALF_YEARLY' && q.half) {
      docsQb.andWhere('d.period_half = :half', { half: q.half });
    }
    if (q.status) {
      docsQb.andWhere('d.status = :status', { status: q.status });
    }

    const existingDocs = await docsQb.getMany();
    const docsByCode = new Map(existingDocs.map((d) => [d.returnCode, d]));

    // Merge master list with existing docs
    const checklist = masterItems.map((master) => {
      const doc = docsByCode.get(master.returnCode);
      return {
        returnCode: master.returnCode,
        returnName: master.returnName,
        lawArea: master.lawArea,
        frequency: master.frequency,
        category: master.category,
        dueDay: master.dueDay,
        stateCode: master.stateCode,
        appliesTo: master.appliesTo,
        uploadRequired: master.uploadRequired,
        dueDateRule: master.dueDateRule,
        riskLevel: master.riskLevel,
        responsibleRole: master.responsibleRole,
        remarks: master.remarks,
        document: doc
          ? {
              id: doc.id,
              status: doc.status,
              uploadedFileName: doc.uploadedFileName,
              uploadedFileUrl: doc.uploadedFileUrl,
              uploadedAt: doc.uploadedAt,
              version: doc.version,
              remarks: doc.remarks,
              uploaderRemarks: doc.uploaderRemarks,
              reviewedAt: doc.reviewedAt,
              isLocked: doc.isLocked,
              dueDate: doc.dueDate,
            }
          : null,
      };
    });

    return { data: checklist, total: checklist.length };
  }

  // ─── Mark Not Applicable (Branch User) ────────────────────

  async markNotApplicable(user: ReqUser, dto: MarkNotApplicableDto) {
    const branchId = dto.branchId;
    await this.assertBranchAccess(user, branchId);

    const companyId = user.clientId;
    if (!companyId)
      throw new ForbiddenException('No company associated with user');

    const master = await this.masterRepo.findOne({
      where: { returnCode: dto.returnCode },
    });
    if (!master)
      throw new BadRequestException(`Invalid return code: ${dto.returnCode}`);

    const existing = await this.findExistingDoc(
      branchId,
      companyId,
      dto.returnCode,
      dto.frequency,
      dto.periodYear,
      dto.periodMonth,
      dto.periodQuarter,
      dto.periodHalf,
    );

    if (existing) {
      if (existing.isLocked) {
        throw new BadRequestException(
          'Cannot modify a locked/approved document.',
        );
      }
      existing.status = ComplianceDocStatus.NOT_APPLICABLE;
      existing.uploaderRemarks = dto.remarks;
      existing.uploadedByUserId = user.userId;
      existing.uploadedAt = new Date();
      return this.docRepo.save(existing);
    }

    const doc = this.docRepo.create({
      tenantId: null,
      companyId,
      branchId,
      moduleSource: 'BRANCHDESK',
      documentScope: 'BRANCH',
      lawArea: master.lawArea,
      returnCode: dto.returnCode,
      returnName: master.returnName,
      frequency: dto.frequency,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth ?? null,
      periodQuarter: dto.periodQuarter ?? null,
      periodHalf: dto.periodHalf ?? null,
      status: ComplianceDocStatus.NOT_APPLICABLE,
      uploaderRemarks: dto.remarks,
      uploadedByUserId: user.userId,
      uploadedAt: new Date(),
      version: 0,
    });

    return this.docRepo.save(doc);
  }

  // ─── Upload (Branch User) ─────────────────────────────────

  async uploadDocument(
    user: ReqUser,
    dto: UploadComplianceDocDto,
    file: UploadedFile,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'File type not allowed. Accepted: PDF, PNG, JPEG, XLS/XLSX',
      );
    }

    const branchId = dto.branchId;
    await this.assertBranchAccess(user, branchId);

    const companyId = user.clientId;
    if (!companyId)
      throw new ForbiddenException('No company associated with user');

    // Verify return code exists
    const master = await this.masterRepo.findOne({
      where: { returnCode: dto.returnCode },
    });
    if (!master)
      throw new BadRequestException(`Invalid return code: ${dto.returnCode}`);

    // Check if document already exists for this branch + period + returnCode
    const existing = await this.findExistingDoc(
      branchId,
      companyId,
      dto.returnCode,
      dto.frequency,
      dto.periodYear,
      dto.periodMonth,
      dto.periodQuarter,
      dto.periodHalf,
    );

    if (existing && existing.isLocked) {
      throw new ForbiddenException(
        'Document is locked after approval. Cannot reupload.',
      );
    }

    // Save file to disk
    const fileUrl = await this.saveFile(
      file,
      companyId,
      branchId,
      dto.returnCode,
      dto.periodYear,
    );

    // Compute due date
    const dueDate = this.computeDueDate(
      master.dueDay,
      dto.frequency,
      dto.periodYear,
      dto.periodMonth,
      dto.periodQuarter,
      dto.periodHalf,
    );

    if (existing) {
      // Reupload scenario
      existing.uploadedFileUrl = fileUrl;
      existing.uploadedFileName = file.originalname;
      existing.uploadedByUserId = user.userId;
      existing.uploadedAt = new Date();
      existing.version = existing.version + 1;
      existing.remarks = null;
      existing.uploaderRemarks = dto.remarks || null;
      existing.reviewedByUserId = null;
      existing.reviewedAt = null;
      existing.dueDate = dueDate;

      const existingStatus = existing.status as ComplianceDocStatus;
      if (existingStatus === ComplianceDocStatus.REUPLOAD_REQUIRED) {
        existing.status = ComplianceDocStatus.RESUBMITTED;
      } else {
        existing.status = ComplianceDocStatus.SUBMITTED;
      }

      return this.docRepo.save(existing);
    }

    // New upload
    const doc = this.docRepo.create({
      tenantId: null,
      companyId,
      branchId,
      moduleSource: 'BRANCHDESK',
      documentScope: 'BRANCH',
      lawArea: master.lawArea,
      returnCode: dto.returnCode,
      returnName: master.returnName,
      frequency: dto.frequency,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth ?? null,
      periodQuarter: dto.periodQuarter ?? null,
      periodHalf: dto.periodHalf ?? null,
      dueDate,
      uploadedFileUrl: fileUrl,
      uploadedFileName: file.originalname,
      uploadedByUserId: user.userId,
      uploadedAt: new Date(),
      status: ComplianceDocStatus.SUBMITTED,
      uploaderRemarks: dto.remarks || null,
      version: 1,
    });

    return this.docRepo.save(doc);
  }

  // ─── CRM Upload On Behalf ─────────────────────────────────

  async crmUploadOnBehalf(
    user: ReqUser,
    dto: UploadComplianceDocDto & { companyId: string },
    file: UploadedFile,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'File type not allowed. Accepted: PDF, PNG, JPEG, XLS/XLSX',
      );
    }

    const branchId = dto.branchId;
    const companyId = dto.companyId;
    if (!companyId) throw new BadRequestException('companyId is required');
    if (!branchId) throw new BadRequestException('branchId is required');

    // Verify CRM is assigned to this client
    const assignment = await this.dataSource.query(
      `SELECT 1 FROM client_assignments_current
       WHERE client_id = $1 AND assignment_type = 'CRM'
         AND assigned_to_user_id = $2 LIMIT 1`,
      [companyId, user.userId],
    );
    if (!assignment?.length) {
      throw new ForbiddenException('You are not assigned to this client');
    }

    // Verify client has on-behalf enabled
    const client = await this.dataSource.query(
      `SELECT crm_on_behalf_enabled FROM clients WHERE id = $1 LIMIT 1`,
      [companyId],
    );
    if (!client?.length || !client[0].crm_on_behalf_enabled) {
      throw new ForbiddenException(
        'CRM on-behalf uploads are not enabled for this client',
      );
    }

    // Verify branch belongs to client
    const branch = await this.dataSource.query(
      `SELECT 1 FROM client_branches WHERE id = $1 AND clientid = $2 AND isactive = true LIMIT 1`,
      [branchId, companyId],
    );
    if (!branch?.length) {
      throw new ForbiddenException(
        'Branch not found or not active for this client',
      );
    }

    // Verify return code exists
    const master = await this.masterRepo.findOne({
      where: { returnCode: dto.returnCode },
    });
    if (!master) {
      throw new BadRequestException(`Invalid return code: ${dto.returnCode}`);
    }

    // Check existing
    const existing = await this.findExistingDoc(
      branchId,
      companyId,
      dto.returnCode,
      dto.frequency,
      dto.periodYear,
      dto.periodMonth,
      dto.periodQuarter,
      dto.periodHalf,
    );

    if (existing && existing.isLocked) {
      throw new ForbiddenException(
        'Document is locked after approval. Cannot reupload.',
      );
    }

    const fileUrl = await this.saveFile(
      file,
      companyId,
      branchId,
      dto.returnCode,
      dto.periodYear,
    );
    const dueDate = this.computeDueDate(
      master.dueDay,
      dto.frequency,
      dto.periodYear,
      dto.periodMonth,
      dto.periodQuarter,
      dto.periodHalf,
    );

    if (existing) {
      existing.uploadedFileUrl = fileUrl;
      existing.uploadedFileName = file.originalname;
      existing.uploadedByUserId = user.userId;
      existing.uploadedAt = new Date();
      existing.version = existing.version + 1;
      existing.remarks = null;
      existing.uploaderRemarks = dto.remarks || null;
      existing.reviewedByUserId = null;
      existing.reviewedAt = null;
      existing.dueDate = dueDate;
      existing.moduleSource = 'CRM';
      existing.uploadedByRole = 'CRM';
      existing.actingOnBehalf = true;
      existing.originalOwnerRole = 'BRANCH';

      const existingStatus = existing.status as ComplianceDocStatus;
      if (existingStatus === ComplianceDocStatus.REUPLOAD_REQUIRED) {
        existing.status = ComplianceDocStatus.RESUBMITTED;
      } else {
        existing.status = ComplianceDocStatus.SUBMITTED;
      }

      const savedExisting = await this.docRepo.save(existing);
      this.auditLogs
        .log({
          entityType: 'DOCUMENT',
          entityId: savedExisting.id,
          action: 'DOCUMENT_UPLOADED' as any,
          performedBy: user.userId,
          performedRole: 'CRM',
          afterJson: {
            fileName: file.originalname,
            version: savedExisting.version,
          },
          meta: {
            actingOnBehalf: true,
            originalOwnerRole: 'BRANCH',
            companyId,
            branchId,
          },
        })
        .catch(() => {});
      return savedExisting;
    }

    const doc = this.docRepo.create({
      tenantId: null,
      companyId,
      branchId,
      moduleSource: 'CRM',
      documentScope: 'BRANCH',
      lawArea: master.lawArea,
      returnCode: dto.returnCode,
      returnName: master.returnName,
      frequency: dto.frequency,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth ?? null,
      periodQuarter: dto.periodQuarter ?? null,
      periodHalf: dto.periodHalf ?? null,
      dueDate,
      uploadedFileUrl: fileUrl,
      uploadedFileName: file.originalname,
      uploadedByUserId: user.userId,
      uploadedAt: new Date(),
      status: ComplianceDocStatus.SUBMITTED,
      uploaderRemarks: dto.remarks || null,
      version: 1,
      uploadedByRole: 'CRM',
      actingOnBehalf: true,
      originalOwnerRole: 'BRANCH',
    });

    const saved = await this.docRepo.save(doc);
    this.auditLogs
      .log({
        entityType: 'DOCUMENT',
        entityId: saved.id,
        action: 'DOCUMENT_UPLOADED' as any,
        performedBy: user.userId,
        performedRole: 'CRM',
        afterJson: { fileName: file.originalname, version: 1 },
        meta: {
          actingOnBehalf: true,
          originalOwnerRole: 'BRANCH',
          companyId,
          branchId,
        },
      })
      .catch(() => {});
    return saved;
  }

  // ─── List for Branch User ─────────────────────────────────

  async listForBranch(user: ReqUser, q: ChecklistQueryDto) {
    const branchId = q.branchId || this.extractBranchId(user);
    if (!branchId) throw new BadRequestException('branchId is required');
    await this.assertBranchAccess(user, branchId);

    const companyId = q.companyId || user.clientId;
    const page = q.page || 1;
    const pageSize = q.pageSize || 50;

    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.branch_id = :branchId', { branchId })
      .andWhere('d.company_id = :companyId', { companyId });

    if (q.year) qb.andWhere('d.period_year = :year', { year: q.year });
    if (q.frequency === 'MONTHLY' && q.month) {
      qb.andWhere('d.period_month = :month', { month: q.month });
    }
    if (q.frequency === 'QUARTERLY' && q.quarter) {
      qb.andWhere('d.period_quarter = :quarter', { quarter: q.quarter });
    }
    if (q.frequency === 'HALF_YEARLY' && q.half) {
      qb.andWhere('d.period_half = :half', { half: q.half });
    }
    if (q.frequency)
      qb.andWhere('d.frequency = :frequency', { frequency: q.frequency });
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });
    if (q.lawArea) qb.andWhere('d.law_area = :la', { la: q.lawArea });

    qb.orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  // ─── Review (CRM) ─────────────────────────────────────────

  async listForCrmReview(_user: ReqUser, q: ChecklistQueryDto) {
    // CRM sees documents belonging to their assigned clients
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.branch', 'branch')
      .leftJoinAndSelect('d.company', 'company');

    if (q.companyId)
      qb.andWhere('d.company_id = :companyId', { companyId: q.companyId });
    if (q.branchId)
      qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q.year) qb.andWhere('d.period_year = :year', { year: q.year });
    if (q.frequency === 'MONTHLY' && q.month) {
      qb.andWhere('d.period_month = :month', { month: q.month });
    }
    if (q.frequency === 'QUARTERLY' && q.quarter) {
      qb.andWhere('d.period_quarter = :quarter', { quarter: q.quarter });
    }
    if (q.frequency === 'HALF_YEARLY' && q.half) {
      qb.andWhere('d.period_half = :half', { half: q.half });
    }
    if (q.frequency)
      qb.andWhere('d.frequency = :frequency', { frequency: q.frequency });
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });
    if (q.lawArea) qb.andWhere('d.law_area = :la', { la: q.lawArea });

    // Only show submitted / resubmitted items for review by default
    if (!q.status) {
      qb.andWhere('d.status IN (:...statuses)', {
        statuses: [
          ComplianceDocStatus.SUBMITTED,
          ComplianceDocStatus.RESUBMITTED,
          ComplianceDocStatus.APPROVED,
          ComplianceDocStatus.REUPLOAD_REQUIRED,
        ],
      });
    }

    const page = q.page || 1;
    const pageSize = q.pageSize || 50;

    qb.orderBy('d.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async reviewDocument(
    user: ReqUser,
    docId: string,
    dto: ReviewComplianceDocDto,
  ) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');

    if (
      ![
        ComplianceDocStatus.SUBMITTED,
        ComplianceDocStatus.RESUBMITTED,
      ].includes(doc.status as ComplianceDocStatus)
    ) {
      throw new BadRequestException(
        `Cannot review document in status ${doc.status}`,
      );
    }

    if (dto.status === 'APPROVED') {
      doc.status = ComplianceDocStatus.APPROVED;
      doc.isLocked = true;
    } else if (dto.status === 'REUPLOAD_REQUIRED') {
      doc.status = ComplianceDocStatus.REUPLOAD_REQUIRED;
      doc.isLocked = false;
    } else {
      throw new BadRequestException(
        'Status must be APPROVED or REUPLOAD_REQUIRED',
      );
    }

    doc.reviewedByUserId = user.userId;
    doc.reviewedAt = new Date();
    doc.remarks = dto.remarks || null;

    const saved = await this.docRepo.save(doc);

    // ── Notify uploader on rejection (item #8: MCD rejection mail) ──
    if (saved.status === ComplianceDocStatus.REUPLOAD_REQUIRED) {
      this.notifyMcdRejection(saved, dto.remarks).catch(() => undefined);
    }

    return saved;
  }

  /** Best-effort: look up uploader email + branch name and send rejection mail. */
  private async notifyMcdRejection(
    doc: ComplianceDocumentEntity,
    remarks: string | null | undefined,
  ): Promise<void> {
    if (!doc.uploadedByUserId) return;
    try {
      const rows = await this.dataSource.query(
        `SELECT u.email AS email, b.branchname AS branch_name
           FROM users u
           LEFT JOIN branches b ON b.id = $2::uuid
          WHERE u.id = $1::uuid AND u.deleted_at IS NULL
          LIMIT 1`,
        [doc.uploadedByUserId, doc.branchId],
      );
      const email = rows?.[0]?.email as string | undefined;
      if (!email) return;

      const month =
        doc.periodMonth && doc.periodYear
          ? `${String(doc.periodMonth).padStart(2, '0')}/${doc.periodYear}`
          : doc.periodYear
            ? String(doc.periodYear)
            : null;

      await this.rejectionMail.sendMcdRejection({
        to: email,
        docName: doc.returnCode || doc.uploadedFileName || 'Compliance document',
        month,
        branchName: rows?.[0]?.branch_name ?? null,
        crmRemarks: remarks ?? null,
        correctionRequired: remarks ?? null,
        dueDate: doc.dueDate ? String(doc.dueDate) : null,
      });
    } catch {
      // swallow — mail must never break the review tx
    }
  }

  // ─── Client (Master Client) view ──────────────────────────

  async listForClient(user: ReqUser, q: ChecklistQueryDto) {
    const companyId = q.companyId || user.clientId;
    if (!companyId) throw new ForbiddenException('No company associated');

    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.branch', 'branch')
      .where('d.company_id = :companyId', { companyId });

    if (q.branchId)
      qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q.year) qb.andWhere('d.period_year = :year', { year: q.year });
    if (q.frequency === 'MONTHLY' && q.month) {
      qb.andWhere('d.period_month = :month', { month: q.month });
    }
    if (q.frequency === 'QUARTERLY' && q.quarter) {
      qb.andWhere('d.period_quarter = :quarter', { quarter: q.quarter });
    }
    if (q.frequency === 'HALF_YEARLY' && q.half) {
      qb.andWhere('d.period_half = :half', { half: q.half });
    }
    if (q.frequency)
      qb.andWhere('d.frequency = :frequency', { frequency: q.frequency });
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });

    const page = q.page || 1;
    const pageSize = q.pageSize || 50;

    qb.orderBy('d.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  // ─── Dashboard KPIs ───────────────────────────────────────

  async getBranchDashboardKpis(
    user: ReqUser,
    branchId: string,
    year: number,
    month?: number,
  ) {
    await this.assertBranchAccess(user, branchId);
    const companyId = user.clientId!;

    const results = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
         COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
         COUNT(*) FILTER (WHERE status = 'RESUBMITTED')::int AS resubmitted,
         COUNT(*) FILTER (WHERE status = 'REUPLOAD_REQUIRED')::int AS reupload_required,
         COUNT(*) FILTER (WHERE status = 'NOT_UPLOADED')::int AS not_uploaded,
         COUNT(*) FILTER (WHERE status = 'OVERDUE')::int AS overdue,
         CASE WHEN COUNT(*) > 0
           THEN ROUND(COUNT(*) FILTER (WHERE status = 'APPROVED')::numeric / COUNT(*)::numeric * 100, 1)
           ELSE 0
         END AS compliance_pct
       FROM compliance_documents
       WHERE branch_id = $1
         AND company_id = $2
         AND period_year = $3
         ${month ? 'AND period_month = $4' : ''}`,
      month ? [branchId, companyId, year, month] : [branchId, companyId, year],
    );

    const flat = results[0] || {
      total: 0,
      approved: 0,
      submitted: 0,
      resubmitted: 0,
      reupload_required: 0,
      not_uploaded: 0,
      overdue: 0,
      compliance_pct: 0,
    };

    // Weighted compliance scoring (across all frequencies for this branch + year)
    const weighted = await this.calculateWeightedCompliance(
      branchId,
      companyId,
      year,
    );

    return { ...flat, ...weighted };
  }

  /**
   * Calculate weighted compliance score across frequencies.
   * Formula: Monthly(60%) + Quarterly(20%) + Yearly(20%)
   * Half-yearly is bundled into the yearly weight bucket.
   */
  async calculateWeightedCompliance(
    branchId: string,
    companyId: string,
    year: number,
  ): Promise<{
    monthly_compliance: number;
    quarterly_compliance: number;
    yearly_compliance: number;
    half_yearly_compliance: number;
    overall_weighted: number;
  }> {
    const rows = await this.dataSource.query(
      `SELECT
         frequency,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved
       FROM compliance_documents
       WHERE branch_id = $1
         AND company_id = $2
         AND period_year = $3
       GROUP BY frequency`,
      [branchId, companyId, year],
    );

    const byFreq: Record<string, { total: number; approved: number }> = {};
    for (const r of rows) {
      byFreq[r.frequency] = {
        total: Number(r.total),
        approved: Number(r.approved),
      };
    }

    const pct = (f: string) => {
      const g = byFreq[f];
      if (!g || !g.total) return 100; // No items = fully compliant by default
      return Math.round((g.approved / g.total) * 1000) / 10;
    };

    const monthly = pct('MONTHLY');
    const quarterly = pct('QUARTERLY');
    const halfYearly = pct('HALF_YEARLY');
    const yearly = pct('YEARLY');

    // Weighted: Monthly 60%, Quarterly 20%, Yearly+HalfYearly 20%
    // If a frequency has no tasks at all, redistribute weight proportionally
    const weights: { pct: number; weight: number; hasTasks: boolean }[] = [
      { pct: monthly, weight: 0.6, hasTasks: !!byFreq['MONTHLY']?.total },
      { pct: quarterly, weight: 0.2, hasTasks: !!byFreq['QUARTERLY']?.total },
      {
        pct: (yearly + halfYearly) / 2,
        weight: 0.2,
        hasTasks: !!(byFreq['YEARLY']?.total || byFreq['HALF_YEARLY']?.total),
      },
    ];

    const activeWeights = weights.filter((w) => w.hasTasks);
    const totalActiveWeight =
      activeWeights.reduce((s, w) => s + w.weight, 0) || 1;

    const overall = activeWeights.reduce(
      (sum, w) => sum + w.pct * (w.weight / totalActiveWeight),
      0,
    );

    return {
      monthly_compliance: monthly,
      quarterly_compliance: quarterly,
      half_yearly_compliance: halfYearly,
      yearly_compliance: yearly,
      overall_weighted: Math.round(overall * 10) / 10,
    };
  }

  async getClientDashboardKpis(
    _user: ReqUser,
    companyId: string,
    year: number,
    month?: number,
  ) {
    // Branch-wise compliance % for Master Client Dashboard
    const results = await this.dataSource.query(
      `SELECT
         b.id AS branch_id,
         b.branchname AS branch_name,
         COUNT(d.id)::int AS total,
         COUNT(d.id) FILTER (WHERE d.status = 'APPROVED')::int AS approved,
         COUNT(d.id) FILTER (WHERE d.status IN ('SUBMITTED','RESUBMITTED'))::int AS pending_review,
         COUNT(d.id) FILTER (WHERE d.status = 'REUPLOAD_REQUIRED')::int AS reupload_required,
         COUNT(d.id) FILTER (WHERE d.status IN ('NOT_UPLOADED','OVERDUE'))::int AS not_uploaded,
         CASE WHEN COUNT(d.id) > 0
           THEN ROUND(COUNT(d.id) FILTER (WHERE d.status = 'APPROVED')::numeric / COUNT(d.id)::numeric * 100, 1)
           ELSE 0
         END AS compliance_pct
       FROM client_branches b
       LEFT JOIN compliance_documents d
         ON d.branch_id = b.id
         AND d.period_year = $2
         ${month ? 'AND d.period_month = $3' : ''}
       WHERE b.clientid = $1
         AND b.isactive = true
         AND b.isdeleted = false
       GROUP BY b.id, b.branchname
       ORDER BY compliance_pct ASC`,
      month ? [companyId, year, month] : [companyId, year],
    );

    // Compute overall + top/bottom 5
    const branches = results || [];
    const totalBranches = branches.length;
    const overallPct =
      totalBranches > 0
        ? Math.round(
            (branches.reduce(
              (sum: number, b: { compliance_pct: string | number }) =>
                sum + Number(b.compliance_pct),
              0,
            ) /
              totalBranches) *
              10,
          ) / 10
        : 0;

    return {
      overallCompliancePct: overallPct,
      totalBranches,
      branches,
      top5Compliant: branches.slice(-5).reverse(),
      bottom5Risky: branches.slice(0, 5),
    };
  }

  async getCrmDashboardKpis(
    _user: ReqUser,
    q: {
      companyId?: string;
      year?: number;
      month?: number;
      frequency?: string;
    },
  ) {
    const year = q.year || new Date().getFullYear();
    const month = q.month;

    const qb = this.docRepo
      .createQueryBuilder('d')
      .select([
        'COUNT(*)::int AS total',
        "COUNT(*) FILTER (WHERE d.status IN ('SUBMITTED','RESUBMITTED'))::int AS pending_review",
        "COUNT(*) FILTER (WHERE d.status = 'APPROVED')::int AS approved",
        "COUNT(*) FILTER (WHERE d.status = 'REUPLOAD_REQUIRED')::int AS reupload_required",
        "COUNT(*) FILTER (WHERE d.status IN ('NOT_UPLOADED','OVERDUE'))::int AS not_uploaded",
        "COUNT(*) FILTER (WHERE d.status = 'OVERDUE')::int AS overdue",
        'COUNT(*) FILTER (WHERE d.acting_on_behalf = true)::int AS crm_on_behalf_total',
        "COUNT(*) FILTER (WHERE d.acting_on_behalf = true AND d.status = 'APPROVED')::int AS crm_on_behalf_approved",
        "COUNT(*) FILTER (WHERE d.acting_on_behalf = true AND d.status IN ('SUBMITTED','RESUBMITTED'))::int AS crm_on_behalf_pending",
      ])
      .where('d.period_year = :year', { year });

    if (q.companyId) qb.andWhere('d.company_id = :cid', { cid: q.companyId });
    if (q.frequency)
      qb.andWhere('d.frequency = :frequency', { frequency: q.frequency });
    // Only filter by month for MONTHLY frequency — YEARLY/QUARTERLY/HALF_YEARLY docs have NULL period_month
    if (month && q.frequency === 'MONTHLY') {
      qb.andWhere('d.period_month = :month', { month });
    }

    const result = await qb.getRawOne();
    return result;
  }

  // ─── Overdue Cron Logic ────────────────────────────────────

  async markOverdueDocuments() {
    const today = new Date().toISOString().split('T')[0];

    const result = await this.dataSource.query(
      `UPDATE compliance_documents
       SET status = 'OVERDUE', updated_at = NOW()
       WHERE status IN ('NOT_UPLOADED', 'REUPLOAD_REQUIRED')
         AND due_date IS NOT NULL
         AND due_date < $1`,
      [today],
    );

    return { affected: result?.[1] || 0 };
  }

  // ─── Auditor read-only ────────────────────────────────────

  async listForAuditor(_user: ReqUser, q: ChecklistQueryDto) {
    // Auditor can view all branches assigned through audits
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.branch', 'branch');

    if (q.companyId)
      qb.andWhere('d.company_id = :companyId', { companyId: q.companyId });
    if (q.branchId)
      qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q.year) qb.andWhere('d.period_year = :year', { year: q.year });
    if (q.frequency === 'MONTHLY' && q.month) {
      qb.andWhere('d.period_month = :month', { month: q.month });
    }
    if (q.frequency === 'QUARTERLY' && q.quarter) {
      qb.andWhere('d.period_quarter = :quarter', { quarter: q.quarter });
    }
    if (q.frequency === 'HALF_YEARLY' && q.half) {
      qb.andWhere('d.period_half = :half', { half: q.half });
    }
    if (q.frequency)
      qb.andWhere('d.frequency = :frequency', { frequency: q.frequency });
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });

    const page = q.page || 1;
    const pageSize = q.pageSize || 50;

    qb.orderBy('d.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  // ─── Compliance Trend (12-month) ────────────────────────────

  async getComplianceTrend(
    branchId: string,
    companyId: string,
    year: number,
  ): Promise<
    Array<{ month: number; total: number; approved: number; percent: number }>
  > {
    const hasBranch = !!branchId;
    const rows = await this.dataSource.query(
      `SELECT
         period_month AS month,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved
       FROM compliance_documents
       WHERE company_id = $1
         AND period_year = $2
         AND frequency = 'MONTHLY'
         AND period_month IS NOT NULL
         ${hasBranch ? 'AND branch_id = $3' : ''}
       GROUP BY period_month
       ORDER BY period_month`,
      hasBranch ? [companyId, year, branchId] : [companyId, year],
    );

    const byMonth = new Map<
      number,
      { month: string; total: string; approved: string }
    >(
      rows.map((r: { month: string; total: string; approved: string }) => [
        Number(r.month),
        r,
      ]),
    );
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const r = byMonth.get(m);
      const total = r ? Number(r.total) : 0;
      const approved = r ? Number(r.approved) : 0;
      return {
        month: m,
        total,
        approved,
        percent: total > 0 ? Math.round((approved / total) * 100) : 0,
      };
    });
  }

  // ─── Risk Exposure Score ──────────────────────────────────

  async calculateRiskExposure(
    branchId: string,
    companyId: string,
    year: number,
  ): Promise<{
    riskScore: number;
    overdue: number;
    reupload: number;
    pending: number;
    riskLevel: string;
  }> {
    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'OVERDUE')::int AS overdue,
         COUNT(*) FILTER (WHERE status = 'REUPLOAD_REQUIRED')::int AS reupload,
         COUNT(*) FILTER (WHERE status IN ('NOT_UPLOADED','SUBMITTED','RESUBMITTED'))::int AS pending
       FROM compliance_documents
       WHERE branch_id = $1
         AND company_id = $2
         AND period_year = $3`,
      [branchId, companyId, year],
    );

    const r = rows[0] || { overdue: 0, reupload: 0, pending: 0 };
    const overdue = Number(r.overdue);
    const reupload = Number(r.reupload);
    const pending = Number(r.pending);

    // Formula: risk = min(100, overdue*8 + reupload*5 + pending*2)
    const riskScore = Math.min(100, overdue * 8 + reupload * 5 + pending * 2);
    const riskLevel =
      riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

    return { riskScore, overdue, reupload, pending, riskLevel };
  }

  // ─── Sidebar Badges (per-frequency overdue + reupload counts) ─

  async getSidebarBadges(
    branchId: string,
    companyId: string,
    year: number,
  ): Promise<Record<string, { overdue: number; reupload: number }>> {
    const rows = await this.dataSource.query(
      `SELECT
         frequency,
         COUNT(*) FILTER (WHERE status = 'OVERDUE')::int AS overdue,
         COUNT(*) FILTER (WHERE status = 'REUPLOAD_REQUIRED')::int AS reupload
       FROM compliance_documents
       WHERE branch_id = $1
         AND company_id = $2
         AND period_year = $3
       GROUP BY frequency`,
      [branchId, companyId, year],
    );

    const badges: Record<string, { overdue: number; reupload: number }> = {
      MONTHLY: { overdue: 0, reupload: 0 },
      QUARTERLY: { overdue: 0, reupload: 0 },
      HALF_YEARLY: { overdue: 0, reupload: 0 },
      YEARLY: { overdue: 0, reupload: 0 },
    };

    for (const r of rows) {
      if (badges[r.frequency]) {
        badges[r.frequency] = {
          overdue: Number(r.overdue),
          reupload: Number(r.reupload),
        };
      }
    }

    return badges;
  }

  // ─── Unified Branch Compliance Dashboard ──────────────────

  async getBranchComplianceDashboard(
    user: ReqUser,
    branchId: string,
    year: number,
  ) {
    await this.assertBranchAccess(user, branchId);
    const companyId = user.clientId!;

    const [kpis, trend, risk, badges] = await Promise.all([
      this.getBranchDashboardKpis(user, branchId, year),
      this.getComplianceTrend(branchId, companyId, year),
      this.calculateRiskExposure(branchId, companyId, year),
      this.getSidebarBadges(branchId, companyId, year),
    ]);

    return {
      monthlyCompliance: kpis.monthly_compliance,
      quarterlyCompliance: kpis.quarterly_compliance,
      halfYearlyCompliance: kpis.half_yearly_compliance,
      yearlyCompliance: kpis.yearly_compliance,
      overallCompliance: kpis.overall_weighted,
      total: kpis.total,
      approved: kpis.approved,
      submitted: kpis.submitted,
      resubmitted: kpis.resubmitted,
      reuploadRequired: kpis.reupload_required,
      notUploaded: kpis.not_uploaded,
      overdueCount: kpis.overdue,
      compliancePct: kpis.compliance_pct,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      riskBreakdown: {
        overdue: risk.overdue,
        reupload: risk.reupload,
        pending: risk.pending,
      },
      trend,
      badges,
    };
  }

  // ─── Lowest Compliance Branches (for Client / CRM) ───────

  async getLowestComplianceBranches(
    companyId: string,
    year: number,
    limit = 10,
  ): Promise<
    Array<{
      branchId: string;
      branchName: string;
      total: number;
      approved: number;
      compliancePct: number;
      overdueCount: number;
      riskScore: number;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT
         b.id AS branch_id,
         b.branchname AS branch_name,
         COUNT(d.id)::int AS total,
         COUNT(d.id) FILTER (WHERE d.status = 'APPROVED')::int AS approved,
         COUNT(d.id) FILTER (WHERE d.status = 'OVERDUE')::int AS overdue_count,
         COUNT(d.id) FILTER (WHERE d.status = 'REUPLOAD_REQUIRED')::int AS reupload_count,
         COUNT(d.id) FILTER (WHERE d.status IN ('NOT_UPLOADED','SUBMITTED','RESUBMITTED'))::int AS pending_count,
         CASE WHEN COUNT(d.id) > 0
           THEN ROUND(COUNT(d.id) FILTER (WHERE d.status = 'APPROVED')::numeric / COUNT(d.id)::numeric * 100, 1)
           ELSE 0
         END AS compliance_pct
       FROM client_branches b
       LEFT JOIN compliance_documents d
         ON d.branch_id = b.id
         AND d.period_year = $2
       WHERE b.clientid = $1
         AND b.isactive = true
         AND b.isdeleted = false
       GROUP BY b.id, b.branchname
       HAVING COUNT(d.id) > 0
       ORDER BY compliance_pct ASC
       LIMIT $3`,
      [companyId, year, limit],
    );

    return (rows || []).map(
      (r: {
        branch_id: string;
        branch_name: string;
        total: string;
        approved: string;
        compliance_pct: string;
        overdue_count: string;
        pending_count?: string;
        reupload_count?: string;
      }) => ({
        branchId: r.branch_id,
        branchName: r.branch_name,
        total: Number(r.total),
        approved: Number(r.approved),
        compliancePct: Number(r.compliance_pct),
        overdueCount: Number(r.overdue_count),
        riskScore: Math.min(
          100,
          Number(r.overdue_count) * 8 +
            Number(r.reupload_count) * 5 +
            Number(r.pending_count) * 2,
        ),
      }),
    );
  }

  // ─── Docs Due Soon (for reminders) ────────────────────────

  async getDocsDueSoon(daysAhead: number): Promise<
    Array<{
      id: string;
      branchId: string;
      companyId: string;
      returnCode: string;
      returnName: string;
      frequency: string;
      dueDate: string;
      status: string;
      uploadedByUserId: string | null;
    }>
  > {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const dateStr = targetDate.toISOString().split('T')[0];

    return this.dataSource.query(
      `SELECT id, branch_id AS "branchId", company_id AS "companyId",
              return_code AS "returnCode", return_name AS "returnName",
              frequency, due_date AS "dueDate", status,
              uploaded_by_user_id AS "uploadedByUserId"
       FROM compliance_documents
       WHERE due_date = $1
         AND status IN ('NOT_UPLOADED', 'REUPLOAD_REQUIRED', 'SUBMITTED', 'RESUBMITTED')`,
      [dateStr],
    );
  }

  // ─── Private Helpers ──────────────────────────────────────

  private extractBranchId(user: ReqUser): string | null {
    if (user.branchIds?.length) return user.branchIds[0];
    return null;
  }

  /** Resolve branchId from query param, user mapping, or first active branch for client */
  async resolveBranchId(user: ReqUser, branchId?: string): Promise<string> {
    let resolved = branchId || this.extractBranchId(user);
    if (!resolved && user.clientId) {
      const rows = await this.dataSource.query(
        `SELECT id FROM client_branches WHERE clientid = $1 AND isactive = true AND isdeleted = false ORDER BY branchname LIMIT 1`,
        [user.clientId],
      );
      if (rows.length) resolved = rows[0].id;
    }
    if (!resolved) throw new BadRequestException('branchId is required');
    return resolved;
  }

  private async assertBranchAccess(user: ReqUser, branchId: string) {
    try {
      await this.branchAccess.assertBranchAccess(
        user.userId ?? user.id,
        branchId,
      );
    } catch {
      // If branchAccess service isn't available, check user.branchIds
      const ids: string[] = user.branchIds || [];
      if (ids.length && !ids.includes(branchId)) {
        throw new ForbiddenException('You do not have access to this branch');
      }
    }
  }

  private async findExistingDoc(
    branchId: string,
    companyId: string,
    returnCode: string,
    frequency: string,
    year: number,
    month?: number,
    quarter?: number,
    half?: number,
  ): Promise<ComplianceDocumentEntity | null> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.branch_id = :branchId', { branchId })
      .andWhere('d.company_id = :companyId', { companyId })
      .andWhere('d.return_code = :returnCode', { returnCode })
      .andWhere('d.frequency = :frequency', { frequency })
      .andWhere('d.period_year = :year', { year });

    if (month) qb.andWhere('d.period_month = :month', { month });
    if (quarter) qb.andWhere('d.period_quarter = :quarter', { quarter });
    if (half) qb.andWhere('d.period_half = :half', { half });

    return qb.getOne();
  }

  private async saveFile(
    file: UploadedFile,
    companyId: string,
    branchId: string,
    returnCode: string,
    year: number,
  ): Promise<string> {
    const dir = path.join(
      process.cwd(),
      'uploads',
      'compliance',
      companyId,
      branchId,
    );
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.originalname) || '.pdf';
    const safeName = `${returnCode}_${year}_${Date.now()}${ext}`;
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, file.buffer);

    return `/uploads/compliance/${companyId}/${branchId}/${safeName}`;
  }

  private computeDueDate(
    dueDay: number | null,
    frequency: string,
    year: number,
    month?: number,
    quarter?: number,
    half?: number,
  ): string | null {
    if (!dueDay) return null;

    if (frequency === 'MONTHLY' && month) {
      // Due on dueDay of next month
      let dueMonth = month + 1;
      let dueYear = year;
      if (dueMonth > 12) {
        dueMonth = 1;
        dueYear++;
      }
      return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    }

    if (frequency === 'QUARTERLY' && quarter) {
      // Due on dueDay of the month after the quarter ends
      // Q1 (Jan-Mar) → due April; Q2 (Apr-Jun) → due July; Q3 (Jul-Sep) → due Oct; Q4 (Oct-Dec) → due Jan+1
      const quarterEndMonths: Record<number, number> = {
        1: 4,
        2: 7,
        3: 10,
        4: 1,
      };
      const dueMonth = quarterEndMonths[quarter] || 4;
      let dueYear = year;
      if (quarter === 4) dueYear++;
      return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    }

    if (frequency === 'HALF_YEARLY' && half) {
      // H1 (Apr-Sep) → due Oct same year; H2 (Oct-Mar) → due April next year
      if (half === 1) {
        return `${year}-10-${String(dueDay).padStart(2, '0')}`;
      }
      return `${year + 1}-04-${String(dueDay).padStart(2, '0')}`;
    }

    // For yearly, return April 30 of next year as default
    if (frequency === 'YEARLY') {
      return `${year + 1}-04-30`;
    }

    return null;
  }
}
