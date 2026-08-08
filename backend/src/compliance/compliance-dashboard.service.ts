import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { UsersService } from '../users/users.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceTask } from './entities/compliance-task.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ComplianceReuploadService } from './compliance-reupload.service';

@Injectable()
export class ComplianceDashboardService {
  constructor(
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(DocumentReuploadRequest)
    private readonly reuploadReqRepo: Repository<DocumentReuploadRequest>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly reuploadService: ComplianceReuploadService,
  ) {}

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

  private async getCrmAssignedClientIds(userId: string): Promise<string[]> {
    return this.reuploadService.getCrmAssignedClientIds(userId);
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
      baseQb.andWhere(
        '(t.branchId IS NULL OR t.branchId IN (:...bids) OR t.assignedToUserId = :uid)',
        {
          bids: scope.branchIds,
          uid: user.userId,
        },
      );
    } else {
      baseQb.andWhere('(t.branchId IS NULL OR t.assignedToUserId = :uid)', {
        uid: user.userId,
      });
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

    // Count rejected and pending contractor_documents (from AuditXpert reviews)
    const docCountRows = await this.tasks.manager.query(
      `SELECT
         SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_docs,
         SUM(CASE WHEN status IN ('UPLOADED','PENDING_REVIEW') THEN 1 ELSE 0 END) AS pending_review_docs
       FROM contractor_documents
       WHERE contractor_user_id = $1`,
      [user.userId],
    );
    const rejectedDocs = Number(docCountRows?.[0]?.rejected_docs ?? 0);
    const pendingReviewDocs = Number(
      docCountRows?.[0]?.pending_review_docs ?? 0,
    );

    return {
      dueToday,
      overdue,
      inProgress,
      submitted,
      rejectedDocs,
      pendingReviewDocs,
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

}
