import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import {
  ComplianceMcdItem,
  McdItemStatus,
} from './entities/compliance-mcd-item.entity';
import { DocumentRemark } from './entities/document-remark.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { UserEntity } from '../users/entities/user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AssignmentsService } from '../assignments/assignments.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron } from '@nestjs/schedule';
import { EmailService } from '../email/email.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private masters: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceTask)
    private tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceEvidence)
    private evidence: Repository<ComplianceEvidence>,
    @InjectRepository(ComplianceComment)
    private comments: Repository<ComplianceComment>,
    @InjectRepository(ComplianceMcdItem)
    private mcdItems: Repository<ComplianceMcdItem>,
    @InjectRepository(DocumentRemark)
    private remarkRepo: Repository<DocumentRemark>,
    @InjectRepository(DocumentReuploadRequest)
    private reuploadReqRepo: Repository<DocumentReuploadRequest>,
    @InjectRepository(DocumentVersion)
    private versionRepo: Repository<DocumentVersion>,
    @InjectRepository(UserEntity)
    private users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
  ) {}

  // Common: list compliance master entries for admin/frontends
  async listComplianceMaster(user: ReqUser) {
    this.assertRole(user, ['ADMIN']);
    return this.masters.find({
      where: { isActive: true },
      order: { complianceName: 'ASC' },
    });
  }

  // ---------- Helpers ----------
  private assertRole(user: ReqUser, allowed: string[]) {
    if (!allowed.includes(user?.roleCode)) {
      throw new ForbiddenException('Access denied');
    }
  }

  private toDateOnly(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private computePeriodCode(year: number, month?: number | null): string {
    if (month && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
    return `${year}`;
  }

  private computeUploadWindow(
    periodYear: number,
    periodMonth?: number | null,
  ): { startDate: string; endDate: string } | null {
    if (!periodMonth || periodMonth < 1 || periodMonth > 12) return null;
    const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
    const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
    const start = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    const end = new Date(Date.UTC(nextYear, nextMonth - 1, 27));
    return {
      startDate: this.toDateOnly(start),
      endDate: this.toDateOnly(end),
    };
  }

  private async assertCrmAssignedToClient(crmUserId: string, clientId: string) {
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      clientId,
      crmUserId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
  }

  private async getContractorScope(contractorUserId: string) {
    const u = await this.users.findOne({
      where: { id: contractorUserId },
      relations: { branches: true },
    });
    if (!u) throw new ForbiddenException('User not found');

    const roleCode = await this.usersService.getUserRoleCode(contractorUserId);
    if (roleCode !== 'CONTRACTOR') {
      throw new ForbiddenException('Contractor only');
    }

    if (!u.clientId)
      throw new ForbiddenException('Contractor missing clientId');

    const branchIds = (u.branches || []).map((b) => b.id);
    return { clientId: u.clientId, branchIds };
  }

  private async assertAuditorAssignedToClient(
    auditorUserId: string,
    clientId: string,
  ) {
    const assigned =
      await this.assignmentsService.getAssignedClientsForAuditor(auditorUserId);
    const ok = (assigned || []).some((c) => c.id === clientId);
    if (!ok)
      throw new ForbiddenException('Client not assigned to this auditor');
  }

  private async getEvidenceWithTaskOrThrow(
    docId: string | number,
  ): Promise<ComplianceEvidence & { task: ComplianceTask }> {
    const doc = await this.evidence.findOne({
      where: { id: Number(docId) },
      relations: ['task'],
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    if (!doc.task) {
      throw new NotFoundException('Task not found for document');
    }
    return doc as ComplianceEvidence & { task: ComplianceTask };
  }

  private async loadTaskOrThrow(taskId: string | number) {
    const idNum = Number(taskId);
    const t = await this.tasks.findOne({
      where: { id: idNum },
      relations: {
        compliance: true,
        branch: true,
        assignedTo: true,
        assignedBy: true,
      },
    });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  private computeOverdueStatus(task: ComplianceTask): TaskStatus {
    if (task.status === 'APPROVED') return task.status;
    const today = this.toDateOnly(new Date());
    if (
      task.dueDate < today &&
      (task.status === 'PENDING' ||
        task.status === 'IN_PROGRESS' ||
        task.status === 'REJECTED')
    ) {
      return 'OVERDUE';
    }
    return task.status;
  }

  private computeMonthlyDueDate(
    periodYear?: number,
    periodMonth?: number,
  ): string | null {
    if (!periodYear || !periodMonth) return null;
    const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
    const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
    const d = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    return this.toDateOnly(d);
  }

  private normalizeComplianceSearch(value: unknown): string {
    const raw =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    return raw
      .trim()
      .toUpperCase()
      .replace(/&/g, ' AND ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private complianceSearchTerms(...values: unknown[]): string[] {
    const terms = new Set<string>();
    const keywordTerms: Array<{ code: string; terms: string[] }> = [
      {
        code: 'MCD',
        terms: ['MCD', 'MONTHLY COMPLIANCE', 'MONTHLY COMPLIANCE DOCUMENT'],
      },
      { code: 'PF', terms: ['PF', 'PROVIDENT FUND'] },
      { code: 'ESI', terms: ['ESI', 'EMPLOYEES STATE INSURANCE'] },
      { code: 'PT', terms: ['PT', 'PROFESSIONAL TAX'] },
      { code: 'LWF', terms: ['LWF', 'LABOUR WELFARE FUND'] },
      { code: 'GST', terms: ['GST'] },
      { code: 'TDS', terms: ['TDS'] },
      { code: 'ROC', terms: ['ROC'] },
    ];

    for (const value of values) {
      const normalized = this.normalizeComplianceSearch(value);
      if (!normalized) continue;

      const tokens = normalized.split(' ').filter(Boolean);
      terms.add(normalized);

      for (const entry of keywordTerms) {
        if (tokens.includes(entry.code)) {
          entry.terms.forEach((term) => terms.add(term));
        }
      }
    }

    return Array.from(terms);
  }

  private deriveComplianceCode(...values: unknown[]): string {
    const combined = values
      .map((value) => this.normalizeComplianceSearch(value))
      .filter(Boolean)
      .join(' ');
    if (!combined) return '';

    const tokens = combined.split(' ').filter(Boolean);
    const hasToken = (token: string) => tokens.includes(token);
    const hasPhrase = (phrase: string) => combined.includes(phrase);

    if (
      hasToken('MCD') ||
      hasPhrase('MONTHLY COMPLIANCE DOCUMENT') ||
      hasPhrase('MONTHLY COMPLIANCE DOCKET') ||
      hasPhrase('MONTHLY COMPLIANCE')
    ) {
      return 'MCD_UPLOAD';
    }
    if (hasToken('PF') || hasPhrase('PROVIDENT FUND')) {
      return 'PF_PAYMENT';
    }
    if (hasToken('ESI') || hasPhrase('EMPLOYEES STATE INSURANCE')) {
      return 'ESI_PAYMENT';
    }
    if (hasToken('PT') || hasPhrase('PROFESSIONAL TAX')) {
      return 'PT_PAYMENT';
    }
    if (hasToken('LWF') || hasPhrase('LABOUR WELFARE FUND')) {
      return 'LWF_PAYMENT';
    }
    if (hasToken('GST')) {
      return 'GST_RETURN';
    }
    if (hasToken('TDS')) {
      return 'TDS_RETURN';
    }
    if (hasToken('ROC')) {
      return 'ROC_FILINGS';
    }

    return combined.replace(/\s+/g, '_');
  }

  private requestedComplianceCodes(...values: unknown[]): string[] {
    const codes = new Set<string>();
    for (const value of values) {
      const code = this.normalizeComplianceSearch(value).replace(/\s+/g, '_');
      if (code) codes.add(code);
      const derived = this.deriveComplianceCode(value);
      if (derived) codes.add(derived);
    }
    return Array.from(codes);
  }

  private taskComplianceCode(task: ComplianceTask): string {
    const masterCode = this.normalizeComplianceSearch(
      task.compliance?.code,
    ).replace(/\s+/g, '_');
    if (masterCode) return masterCode;

    const code = this.deriveComplianceCode(
      task.compliance?.complianceName,
      task.title,
      task.description,
    );
    if (code) return code;

    return '';
  }

  private taskComplianceTitle(task: ComplianceTask): string {
    return task.compliance?.complianceName || task.title || 'Untitled';
  }

  private requestedCodePredicate(
    requestedCodes: string[],
    searchTerms: string[],
  ): Brackets | null {
    if (!requestedCodes.length && !searchTerms.length) return null;

    return new Brackets((subQb) => {
      if (requestedCodes.length) {
        subQb.orWhere(
          `UPPER(COALESCE(compliance.code, '')) IN (:...requestedCodes)`,
          {
            requestedCodes,
          },
        );
      }

      searchTerms.forEach((term, index) => {
        const titleParam = `taskSearchTitle${index}`;
        const descParam = `taskSearchDesc${index}`;
        const complianceParam = `taskSearchCompliance${index}`;
        const likeValue = `%${term}%`;

        subQb.orWhere(`UPPER(COALESCE(t.title, '')) LIKE :${titleParam}`, {
          [titleParam]: likeValue,
        });
        subQb.orWhere(`UPPER(COALESCE(t.description, '')) LIKE :${descParam}`, {
          [descParam]: likeValue,
        });
        subQb.orWhere(
          `UPPER(COALESCE(compliance.complianceName, '')) LIKE :${complianceParam}`,
          {
            [complianceParam]: likeValue,
          },
        );
      });
    });
  }

  // ---------- Dashboards ----------

  async crmDashboard(user: ReqUser) {
    this.assertRole(user, ['CRM']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForCrm(user.userId);
    const clientIds = assignedClients.map((c) => c.id);

    if (!clientIds.length) {
      return {
        clients: 0,
        tasks: {
          pending: 0,
          submitted: 0,
          approved: 0,
          overdue: 0,
        },
        topOverdueBranches: [],
        // Keep response shape consistent with normal flow
        contractorPerformance: [],
      };
    }

    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .groupBy('t.status')
      .getRawMany();

    const byStatus = new Map<string, number>();
    for (const r of rows) {
      byStatus.set(String(r.status), Number(r.count));
    }

    // UI groups all non-final work into "pending" bucket.
    // Statuses used by tasks: PENDING, IN_PROGRESS, REJECTED, SUBMITTED, APPROVED, OVERDUE
    const tasks = {
      pending:
        (byStatus.get('PENDING') ?? 0) +
        (byStatus.get('IN_PROGRESS') ?? 0) +
        (byStatus.get('REJECTED') ?? 0),
      submitted: byStatus.get('SUBMITTED') ?? 0,
      approved: byStatus.get('APPROVED') ?? 0,
      overdue: byStatus.get('OVERDUE') ?? 0,
    };

    const topOverdue = await this.tasks
      .createQueryBuilder('t')
      .leftJoin('t.branch', 'b')
      .select(
        "COALESCE(b.branchName, CONCAT('Branch #', t.branchId))",
        'branchName',
      )
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .andWhere('t.status = :st', { st: 'OVERDUE' })
      .groupBy('b.branchName')
      .addGroupBy('t.branchId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany();

    const contractorRows = await this.tasks
      .createQueryBuilder('t')
      .leftJoin('t.assignedTo', 'u')
      .select('t.assignedToUserId', 'contractorId')
      .addSelect(
        "COALESCE(u.name, CONCAT('User #', t.assignedToUserId))",
        'contractorName',
      )
      .addSelect('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .andWhere('t.assignedToUserId IS NOT NULL')
      .andWhere('t.status IN (:...st)', {
        st: ['SUBMITTED', 'APPROVED', 'OVERDUE'],
      })
      .groupBy('t.assignedToUserId')
      .addGroupBy('u.name')
      .addGroupBy('t.status')
      .orderBy('u.name', 'ASC')
      .getRawMany();

    const contractorMap = new Map<
      string,
      {
        contractorId: string;
        contractorName: string;
        submitted: number;
        approved: number;
        overdue: number;
      }
    >();

    for (const r of contractorRows) {
      const contractorId = String(r.contractorId);
      const contractorName = String(r.contractorName);
      const status = String(r.status);
      const count = Number(r.count);

      const entry = contractorMap.get(contractorId) || {
        contractorId,
        contractorName,
        submitted: 0,
        approved: 0,
        overdue: 0,
      };

      if (status === 'SUBMITTED') entry.submitted += count;
      if (status === 'APPROVED') entry.approved += count;
      if (status === 'OVERDUE') entry.overdue += count;

      contractorMap.set(contractorId, entry);
    }

    // Reupload backlog KPIs (with client/branch breakdown)
    const reuploadBacklog = await this.getReuploadBacklogKpis(clientIds);

    return {
      clients: clientIds.length,
      tasks,
      topOverdueBranches: topOverdue.map(
        (r: { branchName: string; count: string }) => ({
          branchName: String(r.branchName),
          count: Number(r.count),
        }),
      ),
      contractorPerformance: Array.from(contractorMap.values()),
      reuploadBacklog,
    };
  }

  async contractorDashboard(user: ReqUser) {
    this.assertRole(user, ['CONTRACTOR']);
    const scope = await this.getContractorScope(user.userId);

    const today = this.toDateOnly(new Date());

    const baseQb = this.tasks
      .createQueryBuilder('t')
      .where('t.clientId = :clientId', { clientId: scope.clientId })
      .andWhere('(t.assignedToUserId = :uid OR t.assignedToUserId IS NULL)', {
        uid: user.userId,
      });

    if (scope.branchIds.length > 0) {
      baseQb.andWhere('(t.branchId IS NULL OR t.branchId IN (:...bids))', {
        bids: scope.branchIds,
      });
    } else {
      baseQb.andWhere('t.branchId IS NULL');
    }

    const rows = await baseQb
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('t.dueDate', 'dueDate')
      .groupBy('t.status')
      .addGroupBy('t.dueDate')
      .getRawMany();

    let dueToday = 0;
    let overdue = 0;
    let inProgress = 0;
    let submitted = 0;

    for (const r of rows) {
      const status = String(r.status);
      const due = String(r.dueDate);
      const count = Number(r.count);

      if (due === today && (status === 'PENDING' || status === 'IN_PROGRESS')) {
        dueToday += count;
      }
      if (status === 'OVERDUE') {
        overdue += count;
      }
      if (status === 'IN_PROGRESS') {
        inProgress += count;
      }
      if (status === 'SUBMITTED') {
        submitted += count;
      }
    }

    return {
      dueToday,
      overdue,
      inProgress,
      submitted,
    };
  }

  async clientDashboard(user: ReqUser) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const clientId = String(user.clientId);

    // ── Summary: full status breakdown ──
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId = :clientId', { clientId })
      .groupBy('t.status')
      .getRawMany();

    let total = 0;
    let approved = 0;
    let pending = 0;
    let submitted = 0;
    let rejected = 0;
    let overdue = 0;

    for (const r of rows) {
      const status = String(r.status);
      const count = Number(r.count);
      total += count;
      if (status === 'APPROVED') approved += count;
      else if (status === 'OVERDUE') overdue += count;
      else if (status === 'PENDING' || status === 'IN_PROGRESS')
        pending += count;
      else if (status === 'SUBMITTED') submitted += count;
      else if (status === 'REJECTED') rejected += count;
    }

    const compliancePercent =
      total > 0 ? Math.round((approved / total) * 100) : 0;

    // ── Branches: include id + overdue per branch ──
    const branchRows = await this.tasks
      .createQueryBuilder('t')
      .leftJoin('t.branch', 'b')
      .select('t.branchId', 'branchId')
      .addSelect(
        "COALESCE(b.branchName, CONCAT('Branch #', t.branchId))",
        'branchName',
      )
      .addSelect('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId = :clientId', { clientId })
      .groupBy('t.branchId')
      .addGroupBy('b.branchName')
      .addGroupBy('t.status')
      .getRawMany();

    const branchMap = new Map<
      string,
      {
        id: string;
        name: string;
        approved: number;
        overdue: number;
        total: number;
      }
    >();
    for (const r of branchRows) {
      const bid = String(r.branchId);
      const name = String(r.branchName);
      const status = String(r.status);
      const count = Number(r.count);
      const entry = branchMap.get(bid) || {
        id: bid,
        name,
        approved: 0,
        overdue: 0,
        total: 0,
      };
      entry.total += count;
      if (status === 'APPROVED') entry.approved += count;
      if (status === 'OVERDUE') entry.overdue += count;
      branchMap.set(bid, entry);
    }

    const branches = Array.from(branchMap.values()).map((v) => ({
      id: v.id,
      branchName: v.name,
      approved: v.approved,
      overdue: v.overdue,
      total: v.total,
      percent: v.total > 0 ? Math.round((v.approved / v.total) * 100) : 0,
    }));

    // ── Overdue preview: top 10 overdue tasks ──
    const overdueRows = await this.tasks
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.compliance', 'c')
      .leftJoinAndSelect('t.branch', 'b')
      .where('t.clientId = :clientId', { clientId })
      .andWhere('t.status = :st', { st: 'OVERDUE' })
      .orderBy('t.dueDate', 'ASC')
      .limit(10)
      .getMany();

    const overduePreview = overdueRows.map((t) => ({
      id: t.id,
      complianceTitle: t.compliance?.complianceName || 'Untitled',
      branchName: t.branch?.branchName || '-',
      status: 'OVERDUE',
      dueDate: t.dueDate,
    }));

    return {
      summary: {
        total,
        approved,
        pending,
        submitted,
        rejected,
        overdue,
        compliancePercent,
      },
      branches,
      overduePreview,
    };
  }

  async adminDashboard(user: ReqUser) {
    this.assertRole(user, ['ADMIN']);

    const totalClients = await this.assignmentsService.getCurrentAssignments();
    const clientCount = totalClients.length;

    const crmLoad: Record<string, number> = {};
    const auditorLoad: Record<string, number> = {};

    for (const a of totalClients) {
      if (a.crmId) {
        const key = String(a.crmId);
        crmLoad[key] = (crmLoad[key] || 0) + 1;
      }
      if (a.auditorId) {
        const key = String(a.auditorId);
        auditorLoad[key] = (auditorLoad[key] || 0) + 1;
      }
    }

    const overdueCount = await this.tasks.count({
      where: { status: 'OVERDUE' },
    });

    const slaRows = await this.tasks
      .createQueryBuilder('t')
      .leftJoin('t.compliance', 'c')
      .leftJoin('t.branch', 'b')
      .select([
        't.id AS id',
        't.clientId AS clientId',
        't.dueDate AS dueDate',
        't.status AS status',
        'c.complianceName AS complianceName',
        'b.branchName AS branchName',
      ])
      .where('t.status = :st', { st: 'OVERDUE' })
      .orderBy('t.dueDate', 'ASC')
      .limit(50)
      .getRawMany();

    return {
      totalClients: clientCount,
      crmLoad,
      auditorLoad,
      overdueCount,
      slaBreaches: slaRows.map(
        (r: {
          id: string;
          clientId: string;
          dueDate: string;
          status: string;
          complianceName: string | null;
          branchName: string | null;
        }) => ({
          id: Number(r.id),
          clientId: String(r.clientId),
          dueDate: String(r.dueDate),
          status: String(r.status),
          complianceName: r.complianceName,
          branchName: r.branchName,
        }),
      ),
    };
  }

  async auditorDashboard(user: ReqUser) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignedClients.map((c) => c.id);

    if (!clientIds.length) {
      return {
        clients: 0,
        tasks: {
          pending: 0,
          submitted: 0,
          approved: 0,
          overdue: 0,
        },
        topOverdueBranches: [],
        // Keep response shape consistent with normal flow
        contractorPerformance: [],
      };
    }

    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .groupBy('t.status')
      .getRawMany();

    const byStatus = new Map<string, number>();
    for (const r of rows) {
      byStatus.set(String(r.status), Number(r.count));
    }

    // UI groups all non-final work into "pending" bucket.
    const tasks = {
      pending:
        (byStatus.get('PENDING') ?? 0) +
        (byStatus.get('IN_PROGRESS') ?? 0) +
        (byStatus.get('REJECTED') ?? 0),
      submitted: byStatus.get('SUBMITTED') ?? 0,
      approved: byStatus.get('APPROVED') ?? 0,
      overdue: byStatus.get('OVERDUE') ?? 0,
    };

    const topOverdue = await this.tasks
      .createQueryBuilder('t')
      .leftJoin('t.branch', 'b')
      .select(
        "COALESCE(b.branchName, CONCAT('Branch #', t.branchId))",
        'branchName',
      )
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .andWhere('t.status = :st', { st: 'OVERDUE' })
      .groupBy('b.branchName')
      .addGroupBy('t.branchId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany();

    const contractorRows = await this.tasks
      .createQueryBuilder('t')
      .leftJoin('t.assignedTo', 'u')
      .select('t.assignedToUserId', 'contractorId')
      .addSelect(
        "COALESCE(u.name, CONCAT('User #', t.assignedToUserId))",
        'contractorName',
      )
      .addSelect('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .andWhere('t.assignedToUserId IS NOT NULL')
      .andWhere('t.status IN (:...st)', {
        st: ['SUBMITTED', 'APPROVED', 'OVERDUE'],
      })
      .groupBy('t.assignedToUserId')
      .addGroupBy('u.name')
      .addGroupBy('t.status')
      .orderBy('u.name', 'ASC')
      .getRawMany();

    const contractorMap = new Map<
      string,
      {
        contractorId: string;
        contractorName: string;
        submitted: number;
        approved: number;
        overdue: number;
      }
    >();

    for (const r of contractorRows) {
      const contractorId = String(r.contractorId);
      const contractorName = String(r.contractorName);
      const status = String(r.status);
      const count = Number(r.count);

      const entry = contractorMap.get(contractorId) || {
        contractorId,
        contractorName,
        submitted: 0,
        approved: 0,
        overdue: 0,
      };

      if (status === 'SUBMITTED') entry.submitted += count;
      if (status === 'APPROVED') entry.approved += count;
      if (status === 'OVERDUE') entry.overdue += count;

      contractorMap.set(contractorId, entry);
    }

    return {
      clients: clientIds.length,
      tasks,
      topOverdueBranches: topOverdue.map(
        (r: { branchName: string; count: string }) => ({
          branchName: String(r.branchName),
          count: Number(r.count),
        }),
      ),
      contractorPerformance: Array.from(contractorMap.values()),
      reuploadBacklog: await this.getReuploadBacklogKpis(clientIds),
    };
  }

  private async getReuploadBacklogKpis(clientIds: string[]) {
    if (!clientIds.length) {
      return {
        open: 0,
        submitted: 0,
        overdue: 0,
        avgTurnaroundDays: null,
        openClient: 0,
        openBranch: 0,
        submittedClient: 0,
        submittedBranch: 0,
      };
    }

    const counts = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('r.targetRole', 'targetRole')
      .addSelect('COUNT(*)', 'count')
      .where('r.clientId IN (:...clientIds)', { clientIds })
      .groupBy('r.status')
      .addGroupBy('r.targetRole')
      .getRawMany();

    const sumBy = (status: string, role?: string) =>
      Number(
        counts
          .filter(
            (c: { status: string; targetRole: string; count: string }) =>
              c.status === status && (!role || c.targetRole === role),
          )
          .reduce(
            (acc: number, c: { count: string }) => acc + Number(c.count || 0),
            0,
          ),
      );

    const open = sumBy('OPEN');
    const submitted = sumBy('SUBMITTED');
    const openClient = sumBy('OPEN', 'CLIENT');
    const openBranch = sumBy('OPEN', 'BRANCH');
    const submittedClient = sumBy('SUBMITTED', 'CLIENT');
    const submittedBranch = sumBy('SUBMITTED', 'BRANCH');

    const overdueResult = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'count')
      .where('r.clientId IN (:...clientIds)', { clientIds })
      .andWhere('r.status IN (:...active)', { active: ['OPEN', 'SUBMITTED'] })
      .andWhere('r.deadlineDate < CURRENT_DATE')
      .getRawOne();
    const overdue = Number(overdueResult?.count || 0);

    const avgResult = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .select(
        'AVG(EXTRACT(EPOCH FROM (r.submittedAt - r.createdAt)) / 86400)',
        'avg',
      )
      .where('r.clientId IN (:...clientIds)', { clientIds })
      .andWhere('r.submittedAt IS NOT NULL')
      .getRawOne();
    const avgTurnaroundDays = avgResult?.avg
      ? Math.round(Number(avgResult.avg) * 10) / 10
      : null;

    return {
      open,
      submitted,
      overdue,
      avgTurnaroundDays,
      openClient,
      openBranch,
      submittedClient,
      submittedBranch,
    };
  }

  // ---------- CRM APIs ----------

  async crmTaskKpis(user: ReqUser) {
    this.assertRole(user, ['CRM']);
    const clientIds = await this.getCrmAssignedClientIds(user.userId);
    if (!clientIds.length) {
      return {
        total: 0,
        pending: 0,
        inProgress: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
        overdue: 0,
        dueToday: 0,
        dueSoon: 0,
      };
    }

    const today = this.toDateOnly(new Date());
    const threeDaysAhead = new Date();
    threeDaysAhead.setUTCDate(threeDaysAhead.getUTCDate() + 3);
    const threeDaysStr = this.toDateOnly(threeDaysAhead);

    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `SUM(CASE WHEN t.due_date < :today AND t.status IN ('PENDING','IN_PROGRESS','REJECTED') THEN 1 ELSE 0 END)`,
        'overdueCount',
      )
      .addSelect(
        `SUM(CASE WHEN t.due_date = :today AND t.status IN ('PENDING','IN_PROGRESS') THEN 1 ELSE 0 END)`,
        'dueTodayCount',
      )
      .addSelect(
        `SUM(CASE WHEN t.due_date > :today AND t.due_date <= :threeDays AND t.status IN ('PENDING','IN_PROGRESS') THEN 1 ELSE 0 END)`,
        'dueSoonCount',
      )
      .where('t.clientId IN (:...clientIds)', { clientIds })
      .setParameter('today', today)
      .setParameter('threeDays', threeDaysStr)
      .groupBy('t.status')
      .getRawMany();

    const statusCount = (st: string) =>
      Number(
        rows.find((r: { status: string; count: string }) => r.status === st)
          ?.count || 0,
      );

    const total = rows.reduce(
      (s, r: { count: string }) => s + Number(r.count || 0),
      0,
    );
    const overdue = rows.reduce(
      (s, r: { overdueCount: string }) => s + Number(r.overdueCount || 0),
      0,
    );
    const dueToday = rows.reduce(
      (s, r: { dueTodayCount: string }) => s + Number(r.dueTodayCount || 0),
      0,
    );
    const dueSoon = rows.reduce(
      (s, r: { dueSoonCount: string }) => s + Number(r.dueSoonCount || 0),
      0,
    );

    return {
      total,
      pending: statusCount('PENDING'),
      inProgress: statusCount('IN_PROGRESS'),
      submitted: statusCount('SUBMITTED'),
      approved: statusCount('APPROVED'),
      rejected: statusCount('REJECTED'),
      overdue: statusCount('OVERDUE') + overdue,
      dueToday,
      dueSoon,
    };
  }

  async crmBulkApprove(user: ReqUser, taskIds: number[], remarks?: string) {
    this.assertRole(user, ['CRM']);
    if (!taskIds?.length) throw new BadRequestException('taskIds required');

    const results: { id: number; ok: boolean; error?: string }[] = [];

    for (const id of taskIds) {
      try {
        await this.crmApprove(user, String(id), remarks);
        results.push({ id, ok: true });
      } catch (e: unknown) {
        results.push({
          id,
          ok: false,
          error: (e as Error).message || 'Failed',
        });
      }
    }

    return {
      approved: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async crmBulkReject(user: ReqUser, taskIds: number[], remarks: string) {
    this.assertRole(user, ['CRM']);
    if (!taskIds?.length) throw new BadRequestException('taskIds required');
    if (!remarks?.trim()) throw new BadRequestException('remarks required');

    const results: { id: number; ok: boolean; error?: string }[] = [];

    for (const id of taskIds) {
      try {
        await this.crmReject(user, String(id), remarks);
        results.push({ id, ok: true });
      } catch (e: unknown) {
        results.push({
          id,
          ok: false,
          error: (e as Error).message || 'Failed',
        });
      }
    }

    return {
      rejected: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async crmCreateTask(
    user: ReqUser,
    dto: {
      clientId: string;
      branchId?: string;
      complianceId: string;
      periodYear: number;
      periodMonth?: number;
      periodLabel?: string;
      dueDate: string; // YYYY-MM-DD
      assignedToUserId?: string;
      remarks?: string;
    },
  ) {
    this.assertRole(user, ['CRM']);

    if (!dto.clientId || !dto.complianceId || !dto.periodYear || !dto.dueDate) {
      throw new BadRequestException(
        'clientId, complianceId, periodYear, dueDate required',
      );
    }

    await this.assertCrmAssignedToClient(user.userId, dto.clientId);

    if (dto.branchId) {
      const b = await this.branches.findOne({
        where: { id: dto.branchId, clientId: dto.clientId },
      });
      if (!b) throw new BadRequestException('Invalid branch for client');
    }

    const cm = await this.masters.findOne({
      where: { id: dto.complianceId, isActive: true },
    });
    if (!cm)
      throw new BadRequestException('Compliance master not found/inactive');

    if (dto.assignedToUserId) {
      const contractor = await this.users.findOne({
        where: { id: dto.assignedToUserId },
        relations: { branches: true },
      });
      if (!contractor) {
        throw new BadRequestException('Assigned contractor not found');
      }

      const roleCode = await this.usersService.getUserRoleCode(
        dto.assignedToUserId,
      );
      if (roleCode !== 'CONTRACTOR') {
        throw new BadRequestException('Assigned user must be contractor');
      }

      if (String(contractor.clientId) !== String(dto.clientId)) {
        throw new BadRequestException('Contractor not in this client');
      }

      if (dto.branchId) {
        const allowed = (contractor.branches || []).some(
          (bb) => String(bb.id) === String(dto.branchId),
        );
        if (!allowed) {
          throw new BadRequestException('Contractor not mapped to this branch');
        }
      }
    }

    const periodCode = this.computePeriodCode(
      Number(dto.periodYear),
      dto.periodMonth ? Number(dto.periodMonth) : null,
    );
    const window = this.computeUploadWindow(
      Number(dto.periodYear),
      dto.periodMonth ? Number(dto.periodMonth) : null,
    );

    const dueDateValue = window?.endDate || dto.dueDate;
    if (!dueDateValue) {
      throw new BadRequestException('dueDate required');
    }

    const task = this.tasks.create({
      clientId: dto.clientId,
      branchId: dto.branchId ?? null,
      complianceId: dto.complianceId,
      title: cm.complianceName,
      description: cm.description ?? null,
      frequency: cm.frequency,
      periodYear: Number(dto.periodYear),
      periodMonth: dto.periodMonth ? Number(dto.periodMonth) : null,
      periodLabel: dto.periodLabel ?? periodCode,
      assignedToUserId: dto.assignedToUserId ? dto.assignedToUserId : null,
      assignedByUserId: user.userId,
      dueDate: dueDateValue,
      status: 'PENDING',
      remarks: dto.remarks ?? null,
    });

    const saved = await this.tasks.save(task);
    return { id: saved.id };
  }

  async crmListTasks(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['CRM']);

    const clientId = q.clientId ? String(q.clientId) : null;
    if (clientId) await this.assertCrmAssignedToClient(user.userId, clientId);

    // Scope to all clients assigned to this CRM user
    const assignedClientIds = clientId
      ? [clientId]
      : await this.getCrmAssignedClientIds(user.userId);

    if (!assignedClientIds.length) {
      return { items: [], total: 0 };
    }

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));

    const buildCrmQuery = () => {
      const qb = this.tasks
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.compliance', 'compliance')
        .leftJoinAndSelect('t.branch', 'branch')
        .leftJoinAndSelect('t.assignedTo', 'assignedTo')
        .leftJoinAndSelect('t.approvedBy', 'approvedBy')
        .where('t.clientId IN (:...assignedClientIds)', { assignedClientIds });

      if (q.branchId)
        qb.andWhere('t.branchId = :bid', { bid: String(q.branchId) });
      if (q.status) qb.andWhere('t.status = :st', { st: q.status });
      if (q.year) qb.andWhere('t.periodYear = :yy', { yy: Number(q.year) });
      if (q.month) qb.andWhere('t.periodMonth = :mm', { mm: Number(q.month) });
      if (q.monthKey) {
        const [y, m] = q.monthKey.split('-').map(Number);
        if (y && m) {
          qb.andWhere('t.periodYear = :yy', { yy: y });
          qb.andWhere('t.periodMonth = :mm', { mm: m });
        }
      }
      if (q.q) {
        qb.andWhere(
          '(compliance.name ILIKE :search OR t.taskCode ILIKE :search)',
          { search: `%${q.q}%` },
        );
      }

      qb.orderBy('t.id', 'DESC');
      return qb;
    };

    const qb = buildCrmQuery();
    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const mapped = data.map((t) => ({
      ...t,
      status: this.computeOverdueStatus(t),
    }));
    return { items: mapped, total };
  }

  async crmGetTaskDetail(user: ReqUser, taskId: string) {
    this.assertRole(user, ['CRM']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    await this.assertCrmAssignedToClient(user.userId, String(t.clientId));

    const ev = await this.evidence.find({
      where: { taskId: taskIdNum },
      order: { createdAt: 'DESC' },
    });
    const cmRaw = await this.comments.find({
      where: { taskId: taskIdNum },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    // Map comments to include user name
    const cm = cmRaw.map((c) => ({
      ...c,
      userName: c.user?.name || `User #${c.userId}`,
    }));

    // Check if there's an audit report notification thread for this task
    let hasAuditReport = false;
    try {
      const threads = await this.notifications.findThreadsBySubject(
        `Audit Report for Task #${taskIdNum}`,
        String(t.clientId),
      );
      hasAuditReport = threads.length > 0;
    } catch (e) {
      this.logger.warn(
        `Notification (audit-report thread lookup) failed for task #${taskIdNum}`,
        (e as Error)?.message,
      );
      hasAuditReport = false;
    }

    return {
      task: { ...t, status: this.computeOverdueStatus(t) },
      evidence: ev,
      comments: cm,
      auditReport: hasAuditReport,
    };
  }

  async crmAssignTask(user: ReqUser, taskId: string, assignedToUserId: string) {
    this.assertRole(user, ['CRM']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    await this.assertCrmAssignedToClient(user.userId, String(t.clientId));

    const contractor = await this.users.findOne({
      where: { id: assignedToUserId },
      relations: { branches: true },
    });
    if (!contractor) {
      throw new BadRequestException('Assign to contractor only');
    }

    const roleCode = await this.usersService.getUserRoleCode(assignedToUserId);
    if (roleCode !== 'CONTRACTOR') {
      throw new BadRequestException('Assign to contractor only');
    }

    if (String(contractor.clientId) !== String(t.clientId)) {
      throw new BadRequestException('Contractor not in this client');
    }

    if (t.branchId) {
      const allowed = (contractor.branches || []).some(
        (b) => String(b.id) === String(t.branchId),
      );
      if (!allowed) {
        throw new BadRequestException('Contractor not mapped to this branch');
      }
    }

    await this.tasks.update({ id: taskIdNum }, { assignedToUserId });
    return { message: 'assigned' };
  }

  async crmApprove(user: ReqUser, taskId: string, remarks?: string) {
    this.assertRole(user, ['CRM']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);
    await this.assertCrmAssignedToClient(user.userId, String(t.clientId));

    if (t.status !== 'SUBMITTED')
      throw new BadRequestException('Only SUBMITTED can be APPROVED');

    await this.tasks.update(
      { id: taskIdNum },
      {
        status: 'APPROVED',
        remarks: remarks ?? t.remarks ?? null,
        approvedByUserId: user.userId,
        approvedAt: new Date(),
      },
    );

    // Invalidate risk cache for this branch
    if (t.branchId)
      this.riskCache
        .invalidateBranch(t.branchId)
        .catch((e) =>
          this.logger.warn('riskCache invalidation failed', e?.message),
        );

    const clientUser = await this.users.findOne({
      where: { clientId: t.clientId },
    });

    if (clientUser) {
      try {
        await this.notifications.createTicket(user.userId, 'CRM', {
          queryType: 'COMPLIANCE',
          subject: `Task Approved #${taskIdNum}`,
          message: `Compliance task #${taskIdNum} has been approved by CRM.`,
          clientId: t.clientId ? String(t.clientId) : undefined,
          branchId: t.branchId ? String(t.branchId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          `Notification (approval) failed for task #${taskIdNum}`,
          (e as Error)?.message,
        );
      }

      if (clientUser.email) {
        await this.email.send(
          clientUser.email,
          `Task Approved #${taskIdNum}`,
          'Compliance Task Approved',
          `A compliance task has been approved.`,
        );
      }
    }

    return { status: 'APPROVED' };
  }

  async crmReject(user: ReqUser, taskId: string, remarks: string) {
    this.assertRole(user, ['CRM']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);
    await this.assertCrmAssignedToClient(user.userId, String(t.clientId));

    if (t.status !== 'SUBMITTED')
      throw new BadRequestException('Only SUBMITTED can be REJECTED');
    if (!remarks?.trim()) throw new BadRequestException('remarks required');

    await this.tasks.update(
      { id: taskIdNum },
      { status: 'REJECTED', remarks: remarks.trim() },
    );

    // Invalidate risk cache for this branch
    if (t.branchId)
      this.riskCache
        .invalidateBranch(t.branchId)
        .catch((e) =>
          this.logger.warn('riskCache invalidation failed', e?.message),
        );

    if (t.assignedToUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CRM', {
          queryType: 'COMPLIANCE',
          subject: `Task Rejected #${taskIdNum}`,
          message: `Compliance task #${taskIdNum} has been rejected. Reason: ${remarks}`,
          clientId: t.clientId ? String(t.clientId) : undefined,
          branchId: t.branchId ? String(t.branchId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          `Notification (rejection) failed for task #${taskIdNum}`,
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: t.assignedToUserId },
      });
      if (contractor?.email) {
        await this.email.send(
          contractor.email,
          `Task Rejected #${taskIdNum}`,
          'Compliance Task Rejected',
          `Your submitted task was rejected. Please correct and resubmit. Reason: ${remarks}`,
        );
      }
    }

    return { status: 'REJECTED' };
  }

  // ---------- Contractor APIs ----------
  async contractorListTasks(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['CONTRACTOR']);
    const scope = await this.getContractorScope(user.userId);

    const qb = this.tasks
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.compliance', 'compliance')
      .leftJoinAndSelect('t.branch', 'branch')
      .where('t.clientId = :clientId', { clientId: scope.clientId })
      .andWhere('(t.assignedToUserId = :uid OR t.assignedToUserId IS NULL)', {
        uid: user.userId,
      });

    if (scope.branchIds.length > 0) {
      qb.andWhere('(t.branchId IS NULL OR t.branchId IN (:...bids))', {
        bids: scope.branchIds,
      });
    } else {
      qb.andWhere('t.branchId IS NULL');
    }

    if (q.status) qb.andWhere('t.status = :st', { st: q.status });
    if (q.year) qb.andWhere('t.periodYear = :yy', { yy: Number(q.year) });
    if (q.month) qb.andWhere('t.periodMonth = :mm', { mm: Number(q.month) });

    qb.orderBy('t.dueDate', 'ASC');

    const data = await qb.getMany();
    const mapped = data.map((t) => ({
      ...t,
      status: this.computeOverdueStatus(t),
    }));
    return { data: mapped };
  }

  async contractorGetTaskDetail(user: ReqUser, taskId: string) {
    this.assertRole(user, ['CONTRACTOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    const scope = await this.getContractorScope(user.userId);
    if (String(t.clientId) !== String(scope.clientId)) {
      throw new ForbiddenException('Not your client');
    }
    if (t.branchId && !scope.branchIds.includes(String(t.branchId))) {
      throw new ForbiddenException('Not your branch');
    }

    const commentsRaw = await this.comments.find({
      where: { taskId: taskIdNum },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    const comments = commentsRaw.map((c) => ({
      ...c,
      userName: c.user?.name || `User #${c.userId}`,
    }));

    const evidence = await this.evidence.find({
      where: { taskId: taskIdNum },
      order: { createdAt: 'ASC' },
    });

    return {
      task: { ...t, status: this.computeOverdueStatus(t) },
      comments,
      evidence,
    };
  }

  async contractorAddComment(user: ReqUser, taskId: string, message: string) {
    this.assertRole(user, ['CONTRACTOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    const scope = await this.getContractorScope(user.userId);
    if (String(t.clientId) !== String(scope.clientId))
      throw new ForbiddenException('Not your client');
    if (t.branchId && !scope.branchIds.includes(String(t.branchId))) {
      throw new ForbiddenException('Not your branch');
    }

    const c = this.comments.create({
      taskId: taskIdNum,
      userId: user.userId,
      message: message.trim(),
    });
    await this.comments.save(c);
    return { message: 'commented' };
  }

  async contractorSetInProgress(user: ReqUser, taskId: string) {
    this.assertRole(user, ['CONTRACTOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    const scope = await this.getContractorScope(user.userId);
    if (String(t.clientId) !== String(scope.clientId))
      throw new ForbiddenException('Not your client');
    if (t.branchId && !scope.branchIds.includes(String(t.branchId))) {
      throw new ForbiddenException('Not your branch');
    }

    if (!t.assignedToUserId) {
      await this.tasks.update(
        { id: taskIdNum },
        { assignedToUserId: user.userId },
      );
    } else if (String(t.assignedToUserId) !== String(user.userId)) {
      throw new ForbiddenException('Task assigned to another contractor');
    }

    if (
      t.status !== 'PENDING' &&
      t.status !== 'REJECTED' &&
      t.status !== 'OVERDUE'
    ) {
      throw new BadRequestException('Cannot start this task');
    }

    await this.tasks.update({ id: taskIdNum }, { status: 'IN_PROGRESS' });
    return { status: 'IN_PROGRESS' };
  }

  async contractorSubmit(user: ReqUser, taskId: string) {
    this.assertRole(user, ['CONTRACTOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    const scope = await this.getContractorScope(user.userId);
    if (String(t.clientId) !== String(scope.clientId))
      throw new ForbiddenException('Not your client');
    if (t.branchId && !scope.branchIds.includes(String(t.branchId))) {
      throw new ForbiddenException('Not your branch');
    }

    if (!t.assignedToUserId) {
      await this.tasks.update(
        { id: taskIdNum },
        { assignedToUserId: user.userId },
      );
    } else if (String(t.assignedToUserId) !== String(user.userId)) {
      throw new ForbiddenException('Task assigned to another contractor');
    }

    const evCount = await this.evidence.count({ where: { taskId: taskIdNum } });
    if (evCount === 0)
      throw new BadRequestException('Upload evidence before submitting');

    const allowed: TaskStatus[] = [
      'IN_PROGRESS',
      'PENDING',
      'REJECTED',
      'OVERDUE',
    ];
    if (!allowed.includes(t.status))
      throw new BadRequestException('Cannot submit from current status');

    await this.tasks.update({ id: taskIdNum }, { status: 'SUBMITTED' });

    // Invalidate risk cache for this branch
    if (t.branchId)
      this.riskCache
        .invalidateBranch(t.branchId)
        .catch((e) =>
          this.logger.warn('riskCache invalidation failed', e?.message),
        );

    if (t.assignedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CONTRACTOR', {
          queryType: 'COMPLIANCE',
          subject: `Task Submitted #${taskIdNum}`,
          message: `Compliance task #${taskIdNum} has been submitted by a contractor and is ready for CRM review.`,
          clientId: t.clientId ? String(t.clientId) : undefined,
          branchId: t.branchId ? String(t.branchId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          `Notification (submission) failed for task #${taskIdNum}`,
          (e as Error)?.message,
        );
      }

      const crm = await this.users.findOne({
        where: { id: t.assignedByUserId },
      });
      if (crm?.email) {
        await this.email.send(
          crm.email,
          `Task Submitted #${taskIdNum}`,
          'Compliance Task Submitted',
          'A contractor submitted a compliance task for your review.',
        );
      }
    }

    return { status: 'SUBMITTED' };
  }

  async contractorMarkNotApplicable(
    user: ReqUser,
    taskId: string,
    remarks: string,
  ) {
    this.assertRole(user, ['CONTRACTOR']);
    if (!remarks || !remarks.trim()) {
      throw new BadRequestException('Remarks are required');
    }

    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    const scope = await this.getContractorScope(user.userId);
    if (String(t.clientId) !== String(scope.clientId))
      throw new ForbiddenException('Not your client');
    if (t.branchId && !scope.branchIds.includes(String(t.branchId))) {
      throw new ForbiddenException('Not your branch');
    }

    const allowed: TaskStatus[] = [
      'PENDING',
      'IN_PROGRESS',
      'REJECTED',
      'OVERDUE',
    ];
    if (!allowed.includes(t.status)) {
      throw new BadRequestException(
        'Cannot mark as Not Applicable from current status',
      );
    }

    await this.tasks.update(
      { id: taskIdNum },
      {
        status: 'NOT_APPLICABLE' as TaskStatus,
        remarks: remarks.trim(),
        assignedToUserId: t.assignedToUserId || user.userId,
      },
    );

    return { status: 'NOT_APPLICABLE' };
  }

  async contractorUploadEvidence(
    user: ReqUser,
    taskId: string,
    file: Express.Multer.File,
    notes?: string,
  ) {
    this.assertRole(user, ['CONTRACTOR']);
    if (!file) throw new BadRequestException('file required');

    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    const scope = await this.getContractorScope(user.userId);
    if (String(t.clientId) !== String(scope.clientId))
      throw new ForbiddenException('Not your client');
    if (t.branchId && !scope.branchIds.includes(String(t.branchId))) {
      throw new ForbiddenException('Not your branch');
    }

    if (!t.assignedToUserId) {
      await this.tasks.update(
        { id: taskIdNum },
        { assignedToUserId: user.userId },
      );
    } else if (String(t.assignedToUserId) !== String(user.userId)) {
      throw new ForbiddenException('Task assigned to another contractor');
    }

    const ev = this.evidence.create({
      taskId: taskIdNum,
      uploadedByUserId: user.userId,
      fileName: file.originalname,
      filePath: file.path.replace(/\\/g, '/'),
      fileType: file.mimetype,
      fileSize: file.size,
      notes: notes?.trim() || null,
    });
    await this.evidence.save(ev);

    if (['PENDING', 'REJECTED', 'OVERDUE'].includes(t.status)) {
      await this.tasks.update({ id: taskIdNum }, { status: 'IN_PROGRESS' });
    }

    return { message: 'uploaded' };
  }

  // ---------- Auditor APIs ----------
  async auditorListTasks(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignedClients.map((c) => c.id);

    if (!clientIds.length) {
      return { data: [] };
    }

    const qb = this.tasks
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.compliance', 'compliance')
      .leftJoinAndSelect('t.branch', 'branch')
      .leftJoinAndSelect('t.assignedTo', 'assignedTo')
      .leftJoinAndSelect('t.assignedBy', 'assignedBy')
      .where('t.clientId IN (:...clientIds)', { clientIds });

    if (q.clientId) {
      const cid = String(q.clientId);
      await this.assertAuditorAssignedToClient(user.userId, cid);
      qb.andWhere('t.clientId = :clientId', { clientId: cid });
    }
    if (q.branchId)
      qb.andWhere('t.branchId = :bid', { bid: String(q.branchId) });
    if (q.status) qb.andWhere('t.status = :st', { st: q.status });
    if (q.year) qb.andWhere('t.periodYear = :yy', { yy: Number(q.year) });
    if (q.month) qb.andWhere('t.periodMonth = :mm', { mm: Number(q.month) });

    qb.orderBy('t.id', 'DESC');

    const data = await qb.getMany();
    const mapped = data.map((t) => ({
      ...t,
      status: this.computeOverdueStatus(t),
    }));
    return { data: mapped };
  }

  async auditorGetTaskDetail(user: ReqUser, taskId: string) {
    this.assertRole(user, ['AUDITOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    await this.assertAuditorAssignedToClient(user.userId, String(t.clientId));

    const ev = await this.evidence.find({
      where: { taskId: taskIdNum },
      order: { createdAt: 'DESC' },
    });
    const cmRaw = await this.comments.find({
      where: { taskId: taskIdNum },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    const cm = cmRaw.map((c) => ({
      ...c,
      userName: c.user?.name || `User #${c.userId}`,
    }));

    return {
      task: { ...t, status: this.computeOverdueStatus(t) },
      evidence: ev,
      comments: cm,
    };
  }

  async auditorShareReport(user: ReqUser, taskId: string, notes: string) {
    this.assertRole(user, ['AUDITOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    await this.assertAuditorAssignedToClient(user.userId, String(t.clientId));

    if (!notes?.trim()) {
      throw new BadRequestException('notes required');
    }

    const crmUserId = t.assignedByUserId ? String(t.assignedByUserId) : null;

    if (crmUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'AUDIT',
          subject: `Audit Report for Task #${taskIdNum}`,
          message: `An auditor has submitted an audit report for compliance task #${taskIdNum}. Notes: ${notes}`,
          clientId: t.clientId ? String(t.clientId) : undefined,
          branchId: t.branchId ? String(t.branchId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          `Notification (audit report) failed for task #${taskIdNum}`,
          (e as Error)?.message,
        );
      }

      const crm = await this.users.findOne({ where: { id: crmUserId } });
      if (crm?.email) {
        await this.email.send(
          crm.email,
          `Audit Report for Task #${taskIdNum}`,
          'Audit Report Submitted',
          'An auditor has submitted an audit report for one of your compliance tasks.',
        );
      }
    }

    return { status: 'REPORTED' };
  }

  // ---------- Client APIs (read-only) ----------
  async clientListTasks(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const buildQuery = () => {
      const qb = this.tasks
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.compliance', 'compliance')
        .leftJoinAndSelect('t.branch', 'branch')
        .where('t.clientId = :clientId', { clientId: String(user.clientId) });

      if (q.branchId)
        qb.andWhere('t.branchId = :bid', { bid: String(q.branchId) });
      if (q.status && q.status !== 'ALL')
        qb.andWhere('t.status = :st', { st: q.status });
      if (q.year) qb.andWhere('t.periodYear = :yy', { yy: Number(q.year) });
      if (q.month) qb.andWhere('t.periodMonth = :mm', { mm: Number(q.month) });
      if (q.frequency)
        qb.andWhere('t.frequency = :freq', { freq: String(q.frequency) });
      const requestedCodes = this.requestedComplianceCodes(q.code);
      const searchTerms = this.complianceSearchTerms(q.code, q.title);
      const requestedCodePredicate = this.requestedCodePredicate(
        requestedCodes,
        searchTerms,
      );
      if (requestedCodePredicate) {
        qb.andWhere(requestedCodePredicate);
      }
      qb.orderBy('t.dueDate', 'ASC');
      return { qb, requestedCodes };
    };

    let { qb, requestedCodes } = buildQuery();
    let data = await qb.getMany();

    // Auto-generate monthly tasks if none exist for the requested period
    if (
      data.length === 0 &&
      q.frequency === 'MONTHLY' &&
      q.branchId &&
      q.month &&
      q.year
    ) {
      const generated = await this.autoGenerateMonthlyTasks(
        String(user.clientId),
        String(q.branchId),
        Number(q.year),
        Number(q.month),
      );
      if (generated > 0) {
        ({ qb, requestedCodes } = buildQuery());
        data = await qb.getMany();
      }
    }
    let mapped = data.map((t) => {
      const dueDate =
        t.dueDate ||
        (t.frequency === 'MONTHLY'
          ? this.computeMonthlyDueDate(t.periodYear, t.periodMonth || undefined)
          : null);
      const complianceTitle = this.taskComplianceTitle(t);
      const complianceCode = this.taskComplianceCode(t);
      const taskWithDue = {
        ...t,
        dueDate: dueDate || t.dueDate,
      } as ComplianceTask;
      return {
        ...taskWithDue,
        complianceTitle,
        complianceCode,
        branchName: t.branch?.branchName || null,
        status: this.computeOverdueStatus(taskWithDue),
        evidenceCount: 0,
      };
    });

    if (requestedCodes.length) {
      mapped = mapped.filter((task) =>
        requestedCodes.includes(String(task.complianceCode || '')),
      );
    }

    // Deduplicate tasks with same compliance+branch+period (keep earliest by id)
    {
      const seen = new Set<string>();
      mapped = mapped.filter((t) => {
        const key = `${t.complianceId ?? t.complianceCode}|${t.branchId}|${t.periodYear}|${t.periodMonth}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Attach evidence counts so client can see how many files were uploaded per task
    if (mapped.length) {
      const ids = mapped.map((t) => t.id);
      const evidenceRows = await this.evidence
        .createQueryBuilder('e')
        .select('e.taskId', 'taskId')
        .addSelect('COUNT(*)', 'cnt')
        .where('e.taskId IN (:...ids)', { ids })
        .groupBy('e.taskId')
        .getRawMany();

      const evidenceMap = new Map<number, number>();
      for (const r of evidenceRows) {
        evidenceMap.set(Number(r.taskId), Number(r.cnt));
      }

      mapped.forEach((t) => {
        t.evidenceCount = evidenceMap.get(t.id) || 0;
      });
    }

    return { data: mapped };
  }

  /**
   * Compute a stable int32 hash for use as a PostgreSQL advisory lock key.
   */
  private computeAutoGenLockKey(
    clientId: string,
    branchId: string,
    year: number,
    month: number,
  ): number {
    const str = `autogen:${clientId}:${branchId}:${year}:${month}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * Auto-generate monthly compliance tasks for a client/branch if none exist
   * for the given period. Creates one task per active MONTHLY compliance master
   * and seeds standard MCD checklist items for each task.
   * Uses a transactional advisory lock to prevent duplicate generation from
   * concurrent requests.
   */
  async autoGenerateMonthlyTasks(
    clientId: string,
    branchId: string,
    year: number,
    month: number,
  ): Promise<number> {
    try {
      // Use a transaction with advisory lock to prevent race conditions
      return await this.tasks.manager.transaction(async (em) => {
        const lockKey = this.computeAutoGenLockKey(clientId, branchId, year, month);
        await em.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        // Check no tasks exist (safe under advisory lock)
        const existingTasks = await em.find(ComplianceTask, {
          where: {
            clientId,
            branchId,
            periodYear: year,
            periodMonth: month,
            frequency: 'MONTHLY',
          },
        });

        // If tasks exist, backfill MCD items for tasks that are missing them
        if (existingTasks.length > 0) {
          let backfilled = 0;
          for (const task of existingTasks) {
            const itemCount = await em.count(ComplianceMcdItem, { where: { taskId: task.id } });
            if (itemCount === 0) {
              const master = await em.findOne(ComplianceMasterEntity, { where: { id: task.complianceId } });
              const mcdTemplate = this.getMcdTemplate(master?.code || '');
              for (const tmpl of mcdTemplate) {
                const item = em.create(ComplianceMcdItem, {
                  taskId: task.id,
                  itemKey: tmpl.key,
                  itemLabel: tmpl.label,
                  unitType: tmpl.unitType || null,
                  stateCode: null,
                  required: true,
                  status: 'PENDING' as McdItemStatus,
                  remarks: null,
                });
                await em.save(item);
                backfilled++;
              }
            }
          }
          if (backfilled > 0) {
            this.logger.log(
              `Backfilled ${backfilled} MCD items for existing tasks client=${clientId} branch=${branchId} period=${year}-${String(month).padStart(2, '0')}`,
            );
          }
          return 0;
        }

        // Verify the branch belongs to this client
        const branch = await em.findOne(BranchEntity, {
          where: { id: branchId, clientId },
        });
        if (!branch) return 0;

        // Get all active monthly compliance masters
        const monthlyMasters = await em.find(ComplianceMasterEntity, {
          where: { isActive: true, frequency: 'MONTHLY' as any },
          order: { code: 'ASC' },
        });
        if (!monthlyMasters.length) return 0;

        // Find a CRM user assigned to this client (for assignedByUserId)
        let assignedByUserId: string | null = null;
        try {
          const crmRow: any = await em.query(
            `SELECT assigned_to_user_id FROM client_assignments_current
             WHERE client_id = $1 AND assignment_type = 'CRM' LIMIT 1`,
            [clientId],
          );
          if (crmRow?.length) assignedByUserId = crmRow[0].assigned_to_user_id;
        } catch { /* ignore */ }

        // Fallback: find any admin user
        if (!assignedByUserId) {
          const adminRow: any = await em
            .getRepository(UserEntity)
            .createQueryBuilder('u')
            .innerJoin('roles', 'r', 'r.id = u.role_id')
            .where('r.code = :code', { code: 'ADMIN' })
            .andWhere('u.isActive = true')
            .andWhere('u.deletedAt IS NULL')
            .orderBy('u.createdAt', 'ASC')
            .getOne();
          if (adminRow) assignedByUserId = adminRow.id;
        }
        if (!assignedByUserId) return 0;

        const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
        const window = this.computeUploadWindow(year, month);
        const dueDate = window?.endDate || `${year}-${String(month).padStart(2, '0')}-28`;

        let created = 0;
        for (const cm of monthlyMasters) {
          const task = em.create(ComplianceTask, {
            clientId,
            branchId,
            complianceId: cm.id,
            title: cm.complianceName,
            description: `${cm.complianceName} for ${periodLabel}`,
            frequency: 'MONTHLY',
            periodYear: year,
            periodMonth: month,
            periodLabel,
            assignedToUserId: null,
            assignedByUserId,
            dueDate,
            status: 'PENDING' as TaskStatus,
            remarks: null,
          });
          const saved = await em.save(task);

          // Seed standard MCD checklist items for this task
          const mcdTemplate = this.getMcdTemplate(cm.code);
          for (const tmpl of mcdTemplate) {
            const item = em.create(ComplianceMcdItem, {
              taskId: saved.id,
              itemKey: tmpl.key,
              itemLabel: tmpl.label,
              unitType: tmpl.unitType || null,
              stateCode: null,
              required: true,
              status: 'PENDING' as McdItemStatus,
              remarks: null,
            });
            await em.save(item);
          }
          created++;
        }

        this.logger.log(
          `Auto-generated ${created} monthly tasks for client=${clientId} branch=${branchId} period=${periodLabel}`,
        );
        return created;
      });
    } catch (err) {
      this.logger.warn(
        `Auto-generate monthly tasks failed: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Standard MCD checklist items per compliance code.
   * Returns a list of {key, label, unitType} items.
   */
  private getMcdTemplate(
    code: string,
  ): Array<{ key: string; label: string; unitType?: string }> {
    const templates: Record<
      string,
      Array<{ key: string; label: string; unitType?: string }>
    > = {
      PF: [
        { key: 'PF_CHALLAN', label: 'PF Challan (Monthly)', unitType: 'CHALLAN' },
        { key: 'PF_ECR', label: 'PF ECR Filing', unitType: 'RETURN' },
        { key: 'PF_PAYMENT_RECEIPT', label: 'PF Payment Receipt', unitType: 'RECEIPT' },
      ],
      ESI: [
        { key: 'ESI_CHALLAN', label: 'ESI Challan (Monthly)', unitType: 'CHALLAN' },
        { key: 'ESI_RETURN', label: 'ESI Monthly Return', unitType: 'RETURN' },
        { key: 'ESI_PAYMENT_RECEIPT', label: 'ESI Payment Receipt', unitType: 'RECEIPT' },
      ],
      PT: [
        { key: 'PT_CHALLAN', label: 'Professional Tax Challan', unitType: 'CHALLAN' },
        { key: 'PT_RETURN', label: 'PT Monthly Return', unitType: 'RETURN' },
      ],
      LWF: [
        { key: 'LWF_CHALLAN', label: 'Labour Welfare Fund Challan', unitType: 'CHALLAN' },
        { key: 'LWF_RECEIPT', label: 'LWF Payment Receipt', unitType: 'RECEIPT' },
      ],
      TDS: [
        { key: 'TDS_CHALLAN', label: 'TDS Challan (26QB/26QC)', unitType: 'CHALLAN' },
        { key: 'TDS_RETURN', label: 'TDS Monthly Return', unitType: 'RETURN' },
      ],
      GST: [
        { key: 'GST_3B', label: 'GSTR-3B Filing', unitType: 'RETURN' },
        { key: 'GST_CHALLAN', label: 'GST Payment Challan', unitType: 'CHALLAN' },
      ],
      MCD: [
        { key: 'MCD_UPLOAD', label: 'Monthly Compliance Document Upload', unitType: 'DOCUMENT' },
        { key: 'MCD_SUMMARY', label: 'MCD Summary Sheet', unitType: 'DOCUMENT' },
      ],
    };

    // Normalized lookup: try exact code, then prefix match
    const upper = (code || '').toUpperCase().trim();
    if (templates[upper]) return templates[upper];

    // Prefix match (e.g., "PF_MONTHLY" → PF)
    for (const prefix of Object.keys(templates)) {
      if (upper.startsWith(prefix)) return templates[prefix];
    }

    // Default generic template
    return [
      { key: `${upper}_UPLOAD`, label: `${code} — Monthly Upload`, unitType: 'DOCUMENT' },
      { key: `${upper}_RECEIPT`, label: `${code} — Payment Receipt`, unitType: 'RECEIPT' },
    ];
  }

  async clientListMcdItems(user: ReqUser, taskId: string | number) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    try {
      const taskIdNum = Number(taskId);
      const t = await this.loadTaskOrThrow(taskIdNum);
      if (String(t.clientId) !== String(user.clientId)) {
        throw new ForbiddenException('Not your task');
      }

      const items = await this.mcdItems.find({ where: { taskId: taskIdNum } });
      if (!items.length) return { data: [] };

      const itemIds = items.map((i) => i.id);

      // Fetch full evidence records (not just count)
      const evidenceRecords = await this.evidence
        .createQueryBuilder('e')
        .select(['e.id', 'e.mcdItemId', 'e.fileName', 'e.filePath', 'e.fileType', 'e.fileSize', 'e.notes', 'e.createdAt'])
        .where('e.mcdItemId IN (:...itemIds)', { itemIds })
        .orderBy('e.createdAt', 'DESC')
        .getMany();

      const evMap = new Map<number, any[]>();
      for (const r of evidenceRecords) {
        const key = Number(r.mcdItemId);
        if (!evMap.has(key)) evMap.set(key, []);
        evMap.get(key)!.push({
          id: r.id,
          fileName: r.fileName,
          filePath: r.filePath,
          fileType: r.fileType,
          fileSize: r.fileSize,
          notes: r.notes,
          createdAt: r.createdAt,
        });
      }

      const data = items.map((i) => ({
        ...i,
        uploadedByRole: i.uploadedByRole || null,
        evidenceCount: evMap.get(i.id)?.length || 0,
        evidenceFiles: evMap.get(i.id) || [],
      }));

      return { data };
    } catch (err) {
      // Avoid breaking client UI if table/migration missing; log once and return empty
      return { data: [] };
    }
  }

  async clientUploadEvidence(
    user: ReqUser,
    taskId: string,
    file: Express.Multer.File,
    notes?: string,
    mcdItemId?: string | number,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!file) throw new BadRequestException('file required');

    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    if (String(t.clientId) !== String(user.clientId)) {
      throw new ForbiddenException('Not your task');
    }

    if (t.assignedToUserId) {
      throw new ForbiddenException('Task assigned to contractor');
    }

    // Enforce upload window (20-25 of next month for monthly compliance)
    const window = this.computeUploadWindow(
      t.periodYear,
      t.periodMonth || undefined,
    );
    if (window) {
      const today = new Date();
      const start = new Date(`${window.startDate}T00:00:00Z`);
      const end = new Date(`${window.endDate}T23:59:59Z`);
      if (today < start) {
        throw new BadRequestException(
          `Upload window opens ${window.startDate} and closes ${window.endDate}`,
        );
      }
      if (today > end) {
        throw new BadRequestException(
          `Upload window closed on ${window.endDate}`,
        );
      }
    }

    let mcdItem: ComplianceMcdItem | null = null;
    if (mcdItemId !== undefined && mcdItemId !== null && mcdItemId !== '') {
      const mcdIdNum = Number(mcdItemId);
      mcdItem = await this.mcdItems.findOne({ where: { id: mcdIdNum } });
      if (!mcdItem) throw new BadRequestException('MCD item not found');
      if (mcdItem.taskId !== taskIdNum)
        throw new ForbiddenException('Item not part of this task');
      if (mcdItem.uploadedByRole === 'CRM')
        throw new BadRequestException('This item was uploaded by CRM and cannot be modified by client');
      if (mcdItem.status === 'APPROVED' || mcdItem.status === 'VERIFIED')
        throw new BadRequestException('Cannot upload for an already approved/verified item');
    }

    const ev = this.evidence.create({
      taskId: taskIdNum,
      mcdItemId: mcdItem ? mcdItem.id : null,
      uploadedByUserId: user.userId,
      fileName: file.originalname,
      filePath: file.path.replace(/\\/g, '/'),
      fileType: file.mimetype,
      fileSize: file.size,
      notes: notes?.trim() || null,
    });
    await this.evidence.save(ev);

    // Mark MCD item as SUBMITTED and record uploaded by CLIENT
    if (mcdItem) {
      await this.mcdItems.update(
        { id: mcdItem.id },
        { status: 'SUBMITTED' as any, uploadedByRole: 'CLIENT', remarks: null },
      );
    }

    if (['PENDING', 'REJECTED', 'OVERDUE'].includes(t.status)) {
      await this.tasks.update({ id: taskIdNum }, { status: 'IN_PROGRESS' });
    }

    return { message: 'uploaded' };
  }

  async clientSubmitTask(user: ReqUser, taskId: string) {
    this.assertRole(user, ['CLIENT']);

    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    if (String(t.clientId) !== String(user.clientId)) {
      throw new ForbiddenException('Not your task');
    }

    if (t.assignedToUserId) {
      throw new ForbiddenException('Task assigned to contractor');
    }

    const evCount = await this.evidence.count({ where: { taskId: taskIdNum } });
    if (evCount === 0) {
      throw new BadRequestException('Upload evidence before submitting');
    }

    const allowed: TaskStatus[] = [
      'IN_PROGRESS',
      'PENDING',
      'REJECTED',
      'OVERDUE',
    ];
    if (!allowed.includes(t.status)) {
      throw new BadRequestException('Cannot submit from current status');
    }

    await this.tasks.update({ id: taskIdNum }, { status: 'SUBMITTED' });

    // Invalidate risk cache for this branch
    if (t.branchId)
      this.riskCache
        .invalidateBranch(t.branchId)
        .catch((e) =>
          this.logger.warn('riskCache invalidation failed', e?.message),
        );

    const mcdItems = await this.mcdItems.find({ where: { taskId: taskIdNum } });
    if (mcdItems.length) {
      await this.mcdItems.update(
        { taskId: taskIdNum, status: In(['PENDING', 'REJECTED']) },
        { status: 'SUBMITTED' as McdItemStatus },
      );
    }

    if (t.assignedByUserId) {
      const crm = await this.users.findOne({
        where: { id: t.assignedByUserId },
      });
      if (crm?.email) {
        await this.email.send(
          crm.email,
          `Client submitted task #${taskIdNum}`,
          'Compliance Task Submitted',
          'A client submitted a compliance task for your review.',
        );
      }
    }

    return { status: 'SUBMITTED' };
  }

  // ---------- Admin APIs ----------
  async adminListTasks(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['ADMIN']);
    try {
      const qb = this.tasks
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.compliance', 'compliance')
        .leftJoinAndSelect('t.branch', 'branch')
        .leftJoinAndSelect('t.assignedTo', 'assignedTo')
        .leftJoinAndSelect('t.assignedBy', 'assignedBy');

      if (q.clientId)
        qb.andWhere('t.clientId = :cid', { cid: String(q.clientId) });
      if (q.status) qb.andWhere('t.status = :st', { st: q.status });
      if (q.from) qb.andWhere('t.dueDate >= :from', { from: q.from });
      if (q.to) qb.andWhere('t.dueDate <= :to', { to: q.to });

      qb.orderBy('t.id', 'DESC');

      const data = await qb.getMany();
      const mapped = data.map((t) => ({
        ...t,
        status: this.computeOverdueStatus(t),
      }));
      return { data: mapped };
    } catch (err) {
      this.logger.warn('clientListAll query failed', (err as Error)?.message);
      return { data: [] };
    }
  }

  // ---------- Auditor Audit Workflow APIs ----------

  /**
   * List documents (evidence) for auditor to review
   */
  async auditorListDocs(user: ReqUser, filters: Record<string, string>) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    if (!assignedClients.length) {
      return { data: [] };
    }

    const qb = this.evidence
      .createQueryBuilder('ev')
      .leftJoinAndSelect('ev.task', 't')
      .leftJoinAndSelect('t.compliance', 'compliance')
      .leftJoinAndSelect('t.branch', 'branch')
      .where('t.clientId IN (:...clientIds)', {
        clientIds: assignedClients.map((c) => c.id),
      });

    if (filters.clientId) {
      qb.andWhere('t.clientId = :cid', { cid: filters.clientId });
    }
    if (filters.unitId) {
      qb.andWhere('t.branchId = :bid', { bid: filters.unitId });
    }
    if (filters.month && filters.year) {
      qb.andWhere('t.periodMonth = :month', { month: filters.month });
      qb.andWhere('t.periodYear = :year', { year: filters.year });
    }

    qb.orderBy('ev.createdAt', 'DESC');

    const docs = await qb.getMany();
    return { data: docs };
  }

  /**
   * Add auditor remark to a document
   */
  async auditorAddRemark(
    user: ReqUser,
    docId: string,
    dto: { text: string; visibility: string },
  ) {
    this.assertRole(user, ['AUDITOR']);
    throw new ForbiddenException('Auditors cannot review compliance documents');
  }

  // ---------- Client (LegitX) Reupload APIs ----------

  /**
   * List reupload requests for client master user (targetRole = CLIENT)
   */
  async clientListReuploadRequests(
    user: ReqUser,
    filters?: Record<string, string>,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const qb = this.reuploadReqRepo
      .createQueryBuilder('req')
      .where('req.clientId = :clientId', { clientId: String(user.clientId) })
      .andWhere('req.targetRole = :role', { role: 'CLIENT' });

    if (filters?.status) {
      qb.andWhere('req.status = :status', { status: filters.status });
    }

    qb.orderBy('req.createdAt', 'DESC');

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Upload corrected file for a client reupload request
   */
  async clientReuploadFile(
    user: ReqUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'CLIENT' ||
      String(request.clientId) !== String(user.clientId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const originalDoc = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });
    if (!originalDoc)
      throw new NotFoundException('Original document not found');

    const currentVersion = await this.versionRepo.count({
      where: {
        documentId: originalDoc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
      },
    });

    const newVersion = this.versionRepo.create({
      documentId: originalDoc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      versionNo: currentVersion + 1,
      filePath: file.path.replace(/\\/g, '/'),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByRole: 'CLIENT',
      uploadedByUserId: user.userId,
      reuploadRequestId: requestId,
    });
    await this.versionRepo.save(newVersion);

    await this.evidence.update(
      { id: originalDoc.id },
      {
        filePath: file.path.replace(/\\/g, '/'),
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    );

    return { message: 'File uploaded', versionId: newVersion.id };
  }

  /**
   * Submit client reupload for auditor re-verification
   */
  async clientSubmitReupload(user: ReqUser, requestId: string) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'CLIENT' ||
      String(request.clientId) !== String(user.clientId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const versionExists = await this.versionRepo.findOne({
      where: { reuploadRequestId: requestId },
    });
    if (!versionExists) {
      throw new BadRequestException('Please upload file before submitting');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      { status: 'SUBMITTED', submittedAt: new Date() },
    );

    // Notify the auditor who requested the reupload
    if (request.requestedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CLIENT', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Submitted — Doc #${request.documentId}`,
          message: `A client user has re-uploaded a document and it is ready for your review.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const auditor = await this.users.findOne({
        where: { id: request.requestedByUserId },
      });
      if (auditor?.email) {
        await this.email
          .send(
            auditor.email,
            `Reupload Submitted — Doc #${request.documentId}`,
            'Reupload Submitted for Verification',
            'A client user has re-uploaded a corrected document. Please log in to verify.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about submission
    await this.notifyCrmReuploadEvent(
      user.userId,
      'CLIENT',
      request,
      `Reupload Submitted (CLIENT) — Doc #${request.documentId}`,
      `A client user submitted a reupload for Doc #${request.documentId}. Pending auditor verification.`,
    );

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }

  // ---------- Branch (BranchDesk) Reupload APIs ----------

  /**
   * List reupload requests for branch user (targetRole = BRANCH)
   */
  async branchListReuploadRequests(
    user: ReqUser,
    filters?: Record<string, string>,
  ) {
    this.assertRole(user, ['CLIENT']);
    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const qb = this.reuploadReqRepo
      .createQueryBuilder('req')
      .where('req.unitId = :unitId', { unitId: String(branchId) })
      .andWhere('req.targetRole = :role', { role: 'BRANCH' });

    if (filters?.status) {
      qb.andWhere('req.status = :status', { status: filters.status });
    }

    qb.orderBy('req.createdAt', 'DESC');

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Upload corrected file for a branch reupload request
   */
  async branchReuploadFile(
    user: ReqUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    this.assertRole(user, ['CLIENT']);
    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'BRANCH' ||
      String(request.unitId) !== String(branchId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const originalDoc = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });
    if (!originalDoc)
      throw new NotFoundException('Original document not found');

    const currentVersion = await this.versionRepo.count({
      where: {
        documentId: originalDoc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
      },
    });

    const newVersion = this.versionRepo.create({
      documentId: originalDoc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      versionNo: currentVersion + 1,
      filePath: file.path.replace(/\\/g, '/'),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByRole: 'BRANCH',
      uploadedByUserId: user.userId,
      reuploadRequestId: requestId,
    });
    await this.versionRepo.save(newVersion);

    await this.evidence.update(
      { id: originalDoc.id },
      {
        filePath: file.path.replace(/\\/g, '/'),
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    );

    return { message: 'File uploaded', versionId: newVersion.id };
  }

  /**
   * Submit branch reupload for auditor re-verification
   */
  async branchSubmitReupload(user: ReqUser, requestId: string) {
    this.assertRole(user, ['CLIENT']);
    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'BRANCH' ||
      String(request.unitId) !== String(branchId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const versionExists = await this.versionRepo.findOne({
      where: { reuploadRequestId: requestId },
    });
    if (!versionExists) {
      throw new BadRequestException('Please upload file before submitting');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      { status: 'SUBMITTED', submittedAt: new Date() },
    );

    // Notify the auditor who requested the reupload
    if (request.requestedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CLIENT', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Submitted — Doc #${request.documentId}`,
          message: `A branch user has re-uploaded a document and it is ready for your review.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const auditor = await this.users.findOne({
        where: { id: request.requestedByUserId },
      });
      if (auditor?.email) {
        await this.email
          .send(
            auditor.email,
            `Reupload Submitted — Doc #${request.documentId}`,
            'Reupload Submitted for Verification',
            'A branch user has re-uploaded a corrected document. Please log in to verify.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about submission
    await this.notifyCrmReuploadEvent(
      user.userId,
      'CLIENT',
      request,
      `Reupload Submitted (BRANCH) — Doc #${request.documentId}`,
      `A branch user submitted a reupload for Doc #${request.documentId}. Pending auditor verification.`,
    );

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }

  /**
   * Mark a branch reupload request as Not Applicable with remarks
   */
  async branchMarkReuploadNotApplicable(
    user: ReqUser,
    requestId: string,
    remarks: string,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!remarks || !remarks.trim()) {
      throw new BadRequestException('Remarks are required');
    }

    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'BRANCH' ||
      String(request.unitId) !== String(branchId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'NOT_APPLICABLE',
        crmRemarks: `[NOT APPLICABLE] ${remarks.trim()}`,
        submittedAt: new Date(),
      },
    );

    return { message: 'Marked as Not Applicable', status: 'NOT_APPLICABLE' };
  }

  // ---------- Contractor Reupload APIs ----------

  /**
   * List reupload requests for logged-in contractor
   */
  async contractorListReuploadRequests(
    user: ReqUser,
    filters: Record<string, string>,
  ) {
    this.assertRole(user, ['CONTRACTOR']);

    const qb = this.reuploadReqRepo
      .createQueryBuilder('req')
      .where('req.contractorUserId = :uid', { uid: user.userId })
      .andWhere('req.targetRole = :role', { role: 'CONTRACTOR' });

    if (filters.status) {
      qb.andWhere('req.status = :status', { status: filters.status });
    }

    qb.orderBy('req.createdAt', 'DESC');

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Get remarks visible to contractor for a document
   */
  async contractorGetDocRemarks(user: ReqUser, docId: string) {
    this.assertRole(user, ['CONTRACTOR']);

    const doc = await this.getEvidenceWithTaskOrThrow(docId);

    // Ensure contractor is assigned to this task
    if (String(doc.task.assignedToUserId) !== String(user.userId)) {
      throw new ForbiddenException('Not your document');
    }

    const remarks = await this.remarkRepo.find({
      where: {
        documentId: doc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
        visibility: In(['CONTRACTOR_VISIBLE', 'BOTH_VISIBLE']),
      },
      order: { createdAt: 'DESC' },
    });

    return { data: remarks };
  }

  /**
   * Upload file in response to reupload request
   */
  async contractorReuploadFile(
    user: ReqUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    this.assertRole(user, ['CONTRACTOR']);

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Reupload request not found');
    }

    if (String(request.contractorUserId) !== String(user.userId)) {
      throw new ForbiddenException('Not your request');
    }

    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    // Get original document
    const originalDoc = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });

    if (!originalDoc) {
      throw new NotFoundException('Original document not found');
    }

    // Save new version
    const currentVersion = await this.versionRepo.count({
      where: {
        documentId: originalDoc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
      },
    });

    const newVersion = this.versionRepo.create({
      documentId: originalDoc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      versionNo: currentVersion + 1,
      filePath: file.path.replace(/\\/g, '/'),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByRole: 'CONTRACTOR',
      uploadedByUserId: user.userId,
      reuploadRequestId: requestId,
    });

    await this.versionRepo.save(newVersion);

    // Update evidence record with new file
    await this.evidence.update(
      { id: originalDoc.id },
      {
        filePath: file.path.replace(/\\/g, '/'),
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    );

    return { message: 'File uploaded', versionId: newVersion.id };
  }

  /**
   * Submit reupload (mark as submitted for CRM review)
   */
  async contractorSubmitReupload(user: ReqUser, requestId: string) {
    this.assertRole(user, ['CONTRACTOR']);

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Reupload request not found');
    }

    if (String(request.contractorUserId) !== String(user.userId)) {
      throw new ForbiddenException('Not your request');
    }

    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    // Check if file was uploaded
    const versionExists = await this.versionRepo.findOne({
      where: { reuploadRequestId: requestId },
    });

    if (!versionExists) {
      throw new BadRequestException('Please upload file before submitting');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    );

    // Notify the auditor who requested the reupload
    if (request.requestedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CONTRACTOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Submitted — Doc #${request.documentId}`,
          message: `A contractor has re-uploaded a document for reupload request and it is ready for your review.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const auditor = await this.users.findOne({
        where: { id: request.requestedByUserId },
      });
      if (auditor?.email) {
        await this.email
          .send(
            auditor.email,
            `Reupload Submitted — Doc #${request.documentId}`,
            'Reupload Submitted for Verification',
            'A contractor has re-uploaded a corrected document. Please log in to verify.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about submission
    await this.notifyCrmReuploadEvent(
      user.userId,
      'CONTRACTOR',
      request,
      `Reupload Submitted (CONTRACTOR) — Doc #${request.documentId}`,
      `A contractor submitted a reupload for Doc #${request.documentId}. Pending auditor verification.`,
    );

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }

  // ---------- Auditor: Create Reupload Requests ----------
  async createReuploadRequestsFromAuditor(
    user: ReqUser,
    dto: { taskId: string; items: { docId: string; remarks: string }[] },
  ) {
    this.assertRole(user, ['AUDITOR']);

    const taskIdNum = Number(dto.taskId);
    const task = await this.tasks.findOne({ where: { id: taskIdNum } });
    if (!task) throw new NotFoundException('Task not found');

    // Ensure auditor is assigned to this client
    await this.assertAuditorAssignedToClient(
      user.userId,
      String(task.clientId),
    );

    const created: DocumentReuploadRequest[] = [];
    for (const item of dto.items) {
      const evidenceId = Number(item.docId);

      // Verify evidence belongs to this task
      const evidence = await this.evidence.findOne({
        where: { id: evidenceId, taskId: taskIdNum },
      });
      if (!evidence) {
        throw new BadRequestException(
          `Evidence #${item.docId} not found for task #${dto.taskId}`,
        );
      }

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7); // 7-day SLA

      const req = this.reuploadReqRepo.create({
        documentId: evidenceId,
        documentType: 'COMPLIANCE_EVIDENCE',
        clientId: String(task.clientId),
        unitId: task.branchId ? String(task.branchId) : null,
        contractorUserId: task.assignedToUserId
          ? String(task.assignedToUserId)
          : null,
        targetRole: 'CONTRACTOR',
        requestedByRole: 'AUDITOR',
        requestedByUserId: String(user.userId),
        reason: item.remarks.substring(0, 200),
        remarksVisible: item.remarks,
        status: 'OPEN',
        deadlineDate: deadline,
      });
      created.push(await this.reuploadReqRepo.save(req));
    }

    // Notify assigned contractor
    if (task.assignedToUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Required — Task #${taskIdNum}`,
          message: `An auditor has requested re-upload of ${created.length} document(s) for compliance task #${taskIdNum}. Please review and upload corrected files within 7 days.`,
          clientId: task.clientId ? String(task.clientId) : undefined,
          branchId: task.branchId ? String(task.branchId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: task.assignedToUserId },
      });
      if (contractor?.email) {
        await this.email
          .send(
            contractor.email,
            `Reupload Required — Task #${taskIdNum}`,
            'Document Reupload Required',
            `An auditor has requested you to re-upload ${created.length} document(s). Please log in and complete the reupload within 7 days.`,
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about new reupload requests
    for (const reqRow of created) {
      await this.notifyCrmReuploadEvent(
        String(user.userId),
        'AUDITOR',
        reqRow,
        `Reupload Issued — Doc #${reqRow.documentId}`,
        `Auditor issued reupload request (${reqRow.targetRole}) for ${reqRow.documentType || 'document'}. Deadline: ${reqRow.deadlineDate?.toISOString()?.slice(0, 10) || 'N/A'}.`,
      );
    }

    return { created: created.length, ids: created.map((r) => r.id) };
  }

  // ---------- Auditor: List Reupload Requests for Re-verification ----------
  async auditorListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignedClients.map((c) => c.id);

    if (!clientIds.length) return { data: [] };

    const qb = this.reuploadReqRepo
      .createQueryBuilder('r')
      .where('r.clientId IN (:...clientIds)', { clientIds });

    // Status filter with overdue/dueSoon virtual filters
    const today = new Date().toISOString().slice(0, 10);
    const dueSoonDate = new Date();
    dueSoonDate.setDate(dueSoonDate.getDate() + 3);
    const dueSoonStr = dueSoonDate.toISOString().slice(0, 10);

    if (q?.status === 'OVERDUE') {
      qb.andWhere('r.status IN (:...activeStatuses)', {
        activeStatuses: ['OPEN', 'SUBMITTED'],
      });
      qb.andWhere('r.deadlineDate < :today', { today });
    } else if (q?.status === 'DUE_SOON') {
      qb.andWhere('r.status IN (:...activeStatuses)', {
        activeStatuses: ['OPEN', 'SUBMITTED'],
      });
      qb.andWhere('r.deadlineDate >= :today', { today });
      qb.andWhere('r.deadlineDate <= :dueSoon', { dueSoon: dueSoonStr });
    } else if (q?.status) {
      qb.andWhere('r.status = :status', { status: q.status });
    } else {
      qb.andWhere('r.status = :status', { status: 'SUBMITTED' });
    }

    if (q?.clientId) {
      qb.andWhere('r.clientId = :cid', { cid: String(q.clientId) });
    }

    qb.orderBy('r.deadlineDate', 'ASC').addOrderBy('r.submittedAt', 'DESC');

    const data = await qb.getMany();

    // Enrich with document info
    const enriched = await Promise.all(
      data.map(async (r) => {
        const evidence = await this.evidence.findOne({
          where: { id: Number(r.documentId) },
        });
        const latestVersion = await this.versionRepo.findOne({
          where: { reuploadRequestId: r.id },
          order: { versionNo: 'DESC' },
        });
        // SLA computation
        const deadlineDate = r.deadlineDate ? new Date(r.deadlineDate) : null;
        const nowDate = new Date();
        const daysLeft = deadlineDate
          ? Math.ceil(
              (deadlineDate.getTime() - nowDate.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;
        const isOverdue = daysLeft !== null && daysLeft < 0;
        const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

        return {
          ...r,
          documentName: evidence?.fileName || `Document #${r.documentId}`,
          deadlineDate: r.deadlineDate,
          daysLeft,
          isOverdue,
          isDueSoon,
          latestUpload: latestVersion
            ? {
                versionId: latestVersion.id,
                fileName: latestVersion.fileName,
                filePath: latestVersion.filePath,
                uploadedAt: latestVersion.uploadedAt,
              }
            : null,
        };
      }),
    );

    return { data: enriched };
  }

  // ---------- Auditor: Approve Reupload (close request) ----------
  async auditorApproveReupload(
    user: ReqUser,
    requestId: string,
    remarks?: string,
  ) {
    this.assertRole(user, ['AUDITOR']);

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    // Verify auditor is assigned to this client
    await this.assertAuditorAssignedToClient(
      user.userId,
      String(request.clientId),
    );

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED requests can be approved');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'REVERIFIED',
        reverifiedAt: new Date(),
        reverifiedByUserId: String(user.userId),
        crmRemarks: remarks || 'Approved by auditor',
      },
    );

    // Check if all reupload requests for this document's task are resolved
    // to update the task status
    const evidence = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });
    if (evidence?.taskId) {
      await this.syncTaskStatusAfterReupload(evidence.taskId, user.userId);
    }

    // Notify contractor of approval
    if (request.contractorUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Approved — Doc #${request.documentId}`,
          message: `Your re-uploaded document has been approved by the auditor.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: request.contractorUserId },
      });
      if (contractor?.email) {
        await this.email
          .send(
            contractor.email,
            `Reupload Approved — Doc #${request.documentId}`,
            'Re-uploaded Document Approved',
            'Your re-uploaded document has been verified and approved by the auditor.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // CRM visibility
    await this.notifyCrmReuploadEvent(
      String(user.userId),
      'AUDITOR',
      request,
      `Reupload Verified — Doc #${request.documentId}`,
      `Auditor verified reupload for ${request.targetRole} (Doc #${request.documentId}).`,
    );

    return { status: 'REVERIFIED', message: 'Reupload approved' };
  }

  // ---------- Auditor: Reject Reupload (re-open for contractor) ----------
  async auditorRejectReupload(
    user: ReqUser,
    requestId: string,
    remarks: string,
  ) {
    this.assertRole(user, ['AUDITOR']);

    if (!remarks?.trim()) {
      throw new BadRequestException('Remarks are required for rejection');
    }

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    await this.assertAuditorAssignedToClient(
      user.userId,
      String(request.clientId),
    );

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED requests can be rejected');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'REJECTED',
        reverifiedAt: new Date(),
        reverifiedByUserId: String(user.userId),
        crmRemarks: remarks.trim(),
      },
    );

    // Create a new OPEN request so contractor can re-upload (with 7-day SLA)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    const newReq = this.reuploadReqRepo.create({
      documentId: request.documentId,
      documentType: request.documentType,
      clientId: request.clientId,
      unitId: request.unitId,
      contractorUserId: request.contractorUserId,
      targetRole: request.targetRole,
      requestedByRole: 'AUDITOR',
      requestedByUserId: String(user.userId),
      reason: remarks.trim().substring(0, 200),
      remarksVisible: remarks.trim(),
      status: 'OPEN',
      deadlineDate: deadline,
    });
    const saved = await this.reuploadReqRepo.save(newReq);

    // Notify contractor of rejection
    if (request.contractorUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Rejected — Doc #${request.documentId}`,
          message: `Your re-uploaded document was rejected. Reason: ${remarks.trim()}. Please upload a corrected version within 7 days.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: request.contractorUserId },
      });
      if (contractor?.email) {
        await this.email
          .send(
            contractor.email,
            `Reupload Rejected — Doc #${request.documentId}`,
            'Re-uploaded Document Rejected',
            `Your re-uploaded document was rejected: ${remarks.trim()}. Please upload a corrected version.`,
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // CRM visibility
    await this.notifyCrmReuploadEvent(
      String(user.userId),
      'AUDITOR',
      saved,
      `Reupload Rejected — Doc #${request.documentId}`,
      `Auditor rejected reupload for ${request.targetRole} (Doc #${request.documentId}). Remarks: ${remarks.trim()}`,
    );

    return {
      status: 'REJECTED',
      message: 'Reupload rejected — new request created for contractor',
      newRequestId: saved.id,
    };
  }

  // ---------- Helper: CRM Reupload Notification ----------
  private async notifyCrmReuploadEvent(
    actorUserId: string,
    actorRole: string,
    request: DocumentReuploadRequest,
    subject: string,
    message: string,
  ): Promise<void> {
    try {
      await this.notifications.createTicket(actorUserId, actorRole, {
        queryType: 'COMPLIANCE',
        subject,
        message,
        clientId: request.clientId ? String(request.clientId) : undefined,
      });
    } catch (e) {
      this.logger.warn(
        'notification failure (non-blocking)',
        (e as Error)?.message,
      );
    }
  }

  // ---------- Helper: Sync task status after reupload decisions ----------
  private async syncTaskStatusAfterReupload(taskId: number, approverUserId?: string) {
    // Find all reupload requests linked to evidence of this task
    const taskEvidence = await this.evidence.find({
      where: { taskId },
      select: ['id'],
    });
    if (!taskEvidence.length) return;

    const evidenceIds = taskEvidence.map((e) => e.id);

    const openRequests = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .where('r.documentId IN (:...ids)', { ids: evidenceIds })
      .andWhere('r.documentType = :dt', { dt: 'COMPLIANCE_EVIDENCE' })
      .andWhere('r.status IN (:...statuses)', {
        statuses: ['OPEN', 'SUBMITTED'],
      })
      .getCount();

    if (openRequests === 0) {
      // All reupload requests resolved — mark task as APPROVED
      const task = await this.tasks.findOne({ where: { id: taskId } });
      if (
        task &&
        (task.status === 'SUBMITTED' || task.status === 'IN_PROGRESS')
      ) {
        await this.tasks.update(
          { id: taskId },
          {
            status: 'APPROVED',
            approvedByUserId: approverUserId ?? null,
            approvedAt: new Date(),
          },
        );
        if (task.branchId) {
          this.riskCache
            .invalidateBranch(task.branchId)
            .catch((e) =>
              this.logger.warn('riskCache invalidation failed', e?.message),
            );
        }
      }
    }
  }

  /* ═══════ CRM Reupload Backlog — list + top overdue units ═══════ */

  private async getCrmAssignedClientIds(userId: string): Promise<string[]> {
    const clients =
      await this.assignmentsService.getAssignedClientsForCrm(userId);
    return clients.map((c) => c.id);
  }

  async crmListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    const clientIds = await this.getCrmAssignedClientIds(user.id);
    if (!clientIds?.length) return { items: [], total: 0, page: 1, limit: 25 };

    const page = Math.max(1, Number(q?.page || 1));
    const limit = Math.min(100, Math.max(10, Number(q?.limit || 25)));
    const skip = (page - 1) * limit;

    const status =
      q?.status && q.status !== 'ALL' ? String(q.status) : undefined;
    const targetRole =
      q?.targetRole && q.targetRole !== 'ALL'
        ? String(q.targetRole)
        : undefined;
    const search = (q?.q || '').trim();

    const overdue = String(q?.overdue || '') === 'true';
    const dueSoon = String(q?.dueSoon || '') === 'true';
    const slaDays = Math.max(
      1,
      Number(q?.slaDays || (status === 'SUBMITTED' ? 1 : 2)),
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - slaDays * 24 * 60 * 60 * 1000);

    const builder = this.reuploadReqRepo
      .createQueryBuilder('r')
      .where('r.clientId IN (:...clientIds)', { clientIds });

    if (status) builder.andWhere('r.status = :status', { status });
    if (targetRole)
      builder.andWhere('r.targetRole = :targetRole', { targetRole });
    if (q?.unitId) builder.andWhere('r.unitId = :unitId', { unitId: q.unitId });
    if (q?.clientId) builder.andWhere('r.clientId = :cId', { cId: q.clientId });

    // Overdue / Due soon based on updatedAt
    if (overdue) {
      builder.andWhere('r.updatedAt < :cutoff', { cutoff });
    }
    if (dueSoon && !overdue) {
      const soonFrom = new Date(
        now.getTime() - (slaDays - 0.5) * 24 * 60 * 60 * 1000,
      );
      builder.andWhere('r.updatedAt BETWEEN :soonFrom AND :now', {
        soonFrom,
        now,
      });
    }

    // Server-side search
    if (search) {
      builder.andWhere(
        `(CAST(r.document_id AS text) ILIKE :s
          OR COALESCE(r.document_type,'') ILIKE :s
          OR COALESCE(r.reason,'') ILIKE :s
          OR COALESCE(r.remarks_visible,'') ILIKE :s
          OR COALESCE(r.target_role,'') ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    builder.orderBy('r.updatedAt', 'DESC').skip(skip).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    // Enrich with client + branch names
    const branchIds = [
      ...new Set(rows.filter((r) => r.unitId).map((r) => r.unitId!)),
    ];
    const clientIdsUsed = [...new Set(rows.map((r) => r.clientId))];

    let branchMap: Record<string, string> = {};
    if (branchIds.length) {
      const bRows = await this.branches.find({ where: { id: In(branchIds) } });
      branchMap = Object.fromEntries(
        bRows.map((b) => [b.id, b.branchName || 'N/A']),
      );
    }

    let clientMap: Record<string, string> = {};
    if (clientIdsUsed.length) {
      const cRows = await this.reuploadReqRepo.manager.query(
        `SELECT id, client_name AS "clientName" FROM clients WHERE id = ANY($1)`,
        [clientIdsUsed],
      );
      clientMap = Object.fromEntries(
        cRows.map((c: { id: string; clientName: string }) => [
          c.id,
          c.clientName,
        ]),
      );
    }

    const items = rows.map((r) => ({
      ...r,
      clientName: clientMap[r.clientId] || 'N/A',
      unitName: r.unitId ? branchMap[r.unitId] || 'N/A' : 'Client Master',
    }));

    return { items, total, page, limit };
  }

  async crmTopOverdueReuploadUnits(user: ReqUser, q: Record<string, string>) {
    const clientIds = await this.getCrmAssignedClientIds(user.id);
    if (!clientIds?.length) return [];

    const slaDays = Math.max(1, Number(q?.slaDays || 2));
    const now = new Date();
    const cutoff = new Date(now.getTime() - slaDays * 24 * 60 * 60 * 1000);

    const rows = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .select('r.unit_id', 'unitId')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect(
        `SUM(CASE WHEN r.status='OPEN' THEN 1 ELSE 0 END)::int`,
        'open',
      )
      .addSelect(
        `SUM(CASE WHEN r.status='SUBMITTED' THEN 1 ELSE 0 END)::int`,
        'submitted',
      )
      .where('r.clientId IN (:...clientIds)', { clientIds })
      .andWhere('r.status IN (:...sts)', { sts: ['OPEN', 'SUBMITTED'] })
      .andWhere('r.updatedAt < :cutoff', { cutoff })
      .groupBy('r.unit_id')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Enrich unit names
    const unitIds = rows
      .filter((r: { unitId: string | null }) => r.unitId)
      .map((r: { unitId: string | null }) => r.unitId);
    let unitMap: Record<string, string> = {};
    if (unitIds.length) {
      const bRows = await this.branches.find({ where: { id: In(unitIds) } });
      unitMap = Object.fromEntries(
        bRows.map((b) => [b.id, b.branchName || 'N/A']),
      );
    }

    return rows.map(
      (x: {
        unitId: string | null;
        count: string;
        open: string;
        submitted: string;
      }) => ({
        unitId: x.unitId || null,
        unitName: x.unitId
          ? unitMap[x.unitId] || 'N/A'
          : 'Client Master (no unit)',
        count: Number(x.count || 0),
        open: Number(x.open || 0),
        submitted: Number(x.submitted || 0),
      }),
    );
  }
}
