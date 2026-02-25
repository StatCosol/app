import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

@Injectable()
export class ComplianceService {
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
  async listComplianceMaster(user: any) {
    this.assertRole(user, ['ADMIN']);
    return this.masters.find({
      where: { isActive: true },
      order: { complianceName: 'ASC' },
    });
  }

  // ---------- Helpers ----------
  private assertRole(user: any, allowed: string[]) {
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
    const end = new Date(Date.UTC(nextYear, nextMonth - 1, 25));
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
    const ok = (assigned || []).some((c: any) => c.id === clientId);
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

  // ---------- Dashboards ----------

  async crmDashboard(user: any) {
    this.assertRole(user, ['CRM']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForCrm(user.userId);
    const clientIds = assignedClients.map((c: any) => c.id);

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

    return {
      clients: clientIds.length,
      tasks,
      topOverdueBranches: topOverdue.map((r: any) => ({
        branchName: String(r.branchName),
        count: Number(r.count),
      })),
      contractorPerformance: Array.from(contractorMap.values()),
    };
  }

  async contractorDashboard(user: any) {
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

  async clientDashboard(user: any) {
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

    const overduePreview = overdueRows.map((t: any) => ({
      id: t.id,
      complianceTitle:
        t.compliance?.complianceName || t.compliance?.title || 'Untitled',
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

  async adminDashboard(user: any) {
    this.assertRole(user, ['ADMIN']);

    const totalClients = await this.assignmentsService.getCurrentAssignments();
    const clientCount = totalClients.length;

    const crmLoad: Record<string, number> = {};
    const auditorLoad: Record<string, number> = {};

    for (const a of totalClients as any[]) {
      if (a.crmUserId) {
        const key = String(a.crmUserId);
        crmLoad[key] = (crmLoad[key] || 0) + 1;
      }
      if (a.auditorUserId) {
        const key = String(a.auditorUserId);
        auditorLoad[key] = (auditorLoad[key] || 0) + 1;
      }
    }

    const overdueCount = await this.tasks.count({
      where: { status: 'OVERDUE' as any },
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
      slaBreaches: slaRows.map((r: any) => ({
        id: Number(r.id),
        clientId: String(r.clientId),
        dueDate: String(r.dueDate),
        status: String(r.status),
        complianceName: r.complianceName as string | null,
        branchName: r.branchName as string | null,
      })),
    };
  }

  async auditorDashboard(user: any) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignedClients.map((c: any) => c.id);

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
      topOverdueBranches: topOverdue.map((r: any) => ({
        branchName: String(r.branchName),
        count: Number(r.count),
      })),
      contractorPerformance: Array.from(contractorMap.values()),
    };
  }

  // ---------- CRM APIs ----------
  async crmCreateTask(
    user: any,
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

  async crmListTasks(user: any, q: any) {
    this.assertRole(user, ['CRM']);

    const clientId = q.clientId ? String(q.clientId) : null;
    if (clientId) await this.assertCrmAssignedToClient(user.userId, clientId);

    const qb = this.tasks
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.compliance', 'compliance')
      .leftJoinAndSelect('t.branch', 'branch')
      .leftJoinAndSelect('t.assignedTo', 'assignedTo')
      .where('t.assignedByUserId = :crmId', { crmId: user.userId });

    if (clientId) qb.andWhere('t.clientId = :clientId', { clientId });
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

  async crmGetTaskDetail(user: any, taskId: string) {
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

    // TODO: Implement audit report thread check if needed with new notification system
    const hasAuditReport = false;

    return {
      task: { ...t, status: this.computeOverdueStatus(t) },
      evidence: ev,
      comments: cm,
      auditReport: hasAuditReport,
    };
  }

  async crmAssignTask(user: any, taskId: string, assignedToUserId: string) {
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

  async crmApprove(user: any, taskId: string, remarks?: string) {
    this.assertRole(user, ['CRM']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);
    await this.assertCrmAssignedToClient(user.userId, String(t.clientId));

    if (t.status !== 'SUBMITTED')
      throw new BadRequestException('Only SUBMITTED can be APPROVED');

    await this.tasks.update(
      { id: taskIdNum },
      { status: 'APPROVED', remarks: remarks ?? t.remarks ?? null },
    );

    // Invalidate risk cache for this branch
    if (t.branchId) this.riskCache.invalidateBranch(t.branchId).catch(() => {});

    const clientUser = await this.users.findOne({
      where: { clientId: t.clientId },
    });

    if (clientUser) {
      // TODO: Implement notification ticket creation for task approval with new notification system

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

  async crmReject(user: any, taskId: string, remarks: string) {
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
    if (t.branchId) this.riskCache.invalidateBranch(t.branchId).catch(() => {});

    if (t.assignedToUserId) {
      // TODO: Implement notification ticket creation for task rejection with new notification system

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
  async contractorListTasks(user: any, q: any) {
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

  async contractorGetTaskDetail(user: any, taskId: string) {
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

  async contractorAddComment(user: any, taskId: string, message: string) {
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

  async contractorSetInProgress(user: any, taskId: string) {
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

  async contractorSubmit(user: any, taskId: string) {
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
    if (t.branchId) this.riskCache.invalidateBranch(t.branchId).catch(() => {});

    if (t.assignedByUserId) {
      // TODO: Implement notification ticket creation for task submission with new notification system

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

  async contractorUploadEvidence(
    user: any,
    taskId: string,
    file: any,
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
  async auditorListTasks(user: any, q: any) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignedClients.map((c: any) => c.id);

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

  async auditorGetTaskDetail(user: any, taskId: string) {
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

  async auditorShareReport(user: any, taskId: string, notes: string) {
    this.assertRole(user, ['AUDITOR']);
    const taskIdNum = Number(taskId);
    const t = await this.loadTaskOrThrow(taskIdNum);

    await this.assertAuditorAssignedToClient(user.userId, String(t.clientId));

    if (!notes?.trim()) {
      throw new BadRequestException('notes required');
    }

    const crmUserId = t.assignedByUserId ? String(t.assignedByUserId) : null;

    if (crmUserId) {
      // TODO: Implement notification ticket creation for audit report with new notification system

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
  async clientListTasks(user: any, q: any) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

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

    qb.orderBy('t.dueDate', 'ASC');

    const data = await qb.getMany();
    const mapped = data.map((t) => {
      const dueDate =
        t.dueDate ||
        (t.frequency === 'MONTHLY'
          ? this.computeMonthlyDueDate(t.periodYear, t.periodMonth || undefined)
          : null);
      const taskWithDue = {
        ...t,
        dueDate: dueDate || t.dueDate,
      } as ComplianceTask;
      return {
        ...taskWithDue,
        status: this.computeOverdueStatus(taskWithDue),
        evidenceCount: 0,
      };
    });

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

  async clientListMcdItems(user: any, taskId: string | number) {
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
      const evidenceRows = await this.evidence
        .createQueryBuilder('e')
        .select('e.mcdItemId', 'mcdItemId')
        .addSelect('COUNT(*)', 'cnt')
        .where('e.mcdItemId IN (:...itemIds)', { itemIds })
        .groupBy('e.mcdItemId')
        .getRawMany();

      const evMap = new Map<number, number>();
      for (const r of evidenceRows) {
        evMap.set(Number(r.mcdItemId), Number(r.cnt));
      }

      const data = items.map((i) => ({
        ...i,
        evidenceCount: evMap.get(i.id) || 0,
      }));

      return { data };
    } catch (err) {
      // Avoid breaking client UI if table/migration missing; log once and return empty
      return { data: [] };
    }
  }

  async clientUploadEvidence(
    user: any,
    taskId: string,
    file: any,
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

    if (['PENDING', 'REJECTED', 'OVERDUE'].includes(t.status)) {
      await this.tasks.update({ id: taskIdNum }, { status: 'IN_PROGRESS' });
    }

    return { message: 'uploaded' };
  }

  async clientSubmitTask(user: any, taskId: string) {
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
    if (t.branchId) this.riskCache.invalidateBranch(t.branchId).catch(() => {});

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
  async adminListTasks(user: any, q: any) {
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
    } catch (_) {
      return { data: [] };
    }
  }

  // ---------- Auditor Audit Workflow APIs ----------

  /**
   * List documents (evidence) for auditor to review
   */
  async auditorListDocs(user: any, filters: any) {
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
    user: any,
    docId: string,
    dto: { text: string; visibility: string },
  ) {
    this.assertRole(user, ['AUDITOR']);
    throw new ForbiddenException('Auditors cannot review compliance documents');
    const doc = await this.getEvidenceWithTaskOrThrow(docId);

    await this.assertAuditorAssignedToClient(user.userId, doc.task.clientId);

    const remark = this.remarkRepo.create({
      documentId: doc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      createdByRole: 'AUDITOR',
      createdByUserId: user.userId,
      visibility: dto.visibility || 'CONTRACTOR_VISIBLE',
      text: dto.text,
    });

    await this.remarkRepo.save(remark);
    return { message: 'Remark added', remarkId: remark.id };
  }

  /**
   * Request reupload from contractor/client
   */
  async auditorRequestReupload(user: any, docId: string, dto: any) {
    this.assertRole(user, ['AUDITOR']);
    throw new ForbiddenException(
      'Auditors cannot request reupload on compliance documents',
    );
  }

  /**
   * List reupload requests for auditor
   */
  async auditorListReuploadRequests(user: any, filters: any) {
    this.assertRole(user, ['AUDITOR']);
    throw new ForbiddenException(
      'Auditors cannot view compliance reupload requests',
    );
  }

  // ---------- Contractor Reupload APIs ----------

  /**
   * List reupload requests for logged-in contractor
   */
  async contractorListReuploadRequests(user: any, filters: any) {
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
  async contractorGetDocRemarks(user: any, docId: string) {
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
  async contractorReuploadFile(user: any, requestId: string, file: any) {
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
  async contractorSubmitReupload(user: any, requestId: string) {
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

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }
}
