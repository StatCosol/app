import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { UsersService } from '../users/users.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ComplianceReuploadService } from './compliance-reupload.service';

@Injectable()
export class ComplianceCrmTasksService {
  private readonly logger = new Logger(ComplianceCrmTasksService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly masters: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceComment)
    private readonly comments: Repository<ComplianceComment>,
    @InjectRepository(ComplianceEvidence)
    private readonly evidence: Repository<ComplianceEvidence>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
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

  private async assertCrmAssignedToClient(
    crmUserId: string,
    clientId: string,
  ) {
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      clientId,
      crmUserId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
  }

  private async getCrmAssignedClientIds(userId: string): Promise<string[]> {
    return this.reuploadService.getCrmAssignedClientIds(userId);
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
        await this.email.sendAuditMail(
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
        await this.email.sendAuditMail(
          contractor.email,
          `Task Rejected #${taskIdNum}`,
          'Compliance Task Rejected',
          `Your submitted task was rejected. Please correct and resubmit. Reason: ${remarks}`,
        );
      }
    }

    return { status: 'REJECTED' };
  }

}
