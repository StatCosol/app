import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { UsersService } from '../users/users.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import {
  ComplianceMcdItem,
  McdItemStatus,
} from './entities/compliance-mcd-item.entity';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class CompliancePortalTasksService {
  private readonly logger = new Logger(CompliancePortalTasksService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly masters: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceComment)
    private readonly comments: Repository<ComplianceComment>,
    @InjectRepository(ComplianceEvidence)
    private readonly evidence: Repository<ComplianceEvidence>,
    @InjectRepository(ComplianceMcdItem)
    private readonly mcdItems: Repository<ComplianceMcdItem>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
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
      qb.andWhere(
        '(t.branchId IS NULL OR t.branchId IN (:...bids) OR t.assignedToUserId = :uid)',
        {
          bids: scope.branchIds,
          uid: user.userId,
        },
      );
    } else {
      qb.andWhere('(t.branchId IS NULL OR t.assignedToUserId = :uid)', {
        uid: user.userId,
      });
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
    if (
      t.branchId &&
      !scope.branchIds.includes(String(t.branchId)) &&
      String(t.assignedToUserId || '') !== String(user.userId)
    ) {
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
    if (
      t.branchId &&
      !scope.branchIds.includes(String(t.branchId)) &&
      String(t.assignedToUserId || '') !== String(user.userId)
    ) {
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
    if (
      t.branchId &&
      !scope.branchIds.includes(String(t.branchId)) &&
      String(t.assignedToUserId || '') !== String(user.userId)
    ) {
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
    if (
      t.branchId &&
      !scope.branchIds.includes(String(t.branchId)) &&
      String(t.assignedToUserId || '') !== String(user.userId)
    ) {
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
        await this.email.sendAuditMail(
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
    if (
      t.branchId &&
      !scope.branchIds.includes(String(t.branchId)) &&
      String(t.assignedToUserId || '') !== String(user.userId)
    ) {
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
    if (
      t.branchId &&
      !scope.branchIds.includes(String(t.branchId)) &&
      String(t.assignedToUserId || '') !== String(user.userId)
    ) {
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
        await this.email.sendAuditMail(
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
        const lockKey = this.computeAutoGenLockKey(
          clientId,
          branchId,
          year,
          month,
        );
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
            const itemCount = await em.count(ComplianceMcdItem, {
              where: { taskId: task.id },
            });
            if (itemCount === 0) {
              const master = await em.findOne(ComplianceMasterEntity, {
                where: { id: task.complianceId },
              });
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
        } catch {
          /* ignore */
        }

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
        const dueDate =
          window?.endDate || `${year}-${String(month).padStart(2, '0')}-28`;

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
        {
          key: 'PF_CHALLAN',
          label: 'PF Challan (Monthly)',
          unitType: 'CHALLAN',
        },
        { key: 'PF_ECR', label: 'PF ECR Filing', unitType: 'RETURN' },
        {
          key: 'PF_PAYMENT_RECEIPT',
          label: 'PF Payment Receipt',
          unitType: 'RECEIPT',
        },
      ],
      ESI: [
        {
          key: 'ESI_CHALLAN',
          label: 'ESI Challan (Monthly)',
          unitType: 'CHALLAN',
        },
        { key: 'ESI_RETURN', label: 'ESI Monthly Return', unitType: 'RETURN' },
        {
          key: 'ESI_PAYMENT_RECEIPT',
          label: 'ESI Payment Receipt',
          unitType: 'RECEIPT',
        },
      ],
      PT: [
        {
          key: 'PT_CHALLAN',
          label: 'Professional Tax Challan',
          unitType: 'CHALLAN',
        },
        { key: 'PT_RETURN', label: 'PT Monthly Return', unitType: 'RETURN' },
      ],
      LWF: [
        {
          key: 'LWF_CHALLAN',
          label: 'Labour Welfare Fund Challan',
          unitType: 'CHALLAN',
        },
        {
          key: 'LWF_RECEIPT',
          label: 'LWF Payment Receipt',
          unitType: 'RECEIPT',
        },
      ],
      TDS: [
        {
          key: 'TDS_CHALLAN',
          label: 'TDS Challan (26QB/26QC)',
          unitType: 'CHALLAN',
        },
        { key: 'TDS_RETURN', label: 'TDS Monthly Return', unitType: 'RETURN' },
      ],
      GST: [
        { key: 'GST_3B', label: 'GSTR-3B Filing', unitType: 'RETURN' },
        {
          key: 'GST_CHALLAN',
          label: 'GST Payment Challan',
          unitType: 'CHALLAN',
        },
      ],
      MCD: [
        {
          key: 'MCD_UPLOAD',
          label: 'Monthly Compliance Document Upload',
          unitType: 'DOCUMENT',
        },
        {
          key: 'MCD_SUMMARY',
          label: 'MCD Summary Sheet',
          unitType: 'DOCUMENT',
        },
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
      {
        key: `${upper}_UPLOAD`,
        label: `${code} — Monthly Upload`,
        unitType: 'DOCUMENT',
      },
      {
        key: `${upper}_RECEIPT`,
        label: `${code} — Payment Receipt`,
        unitType: 'RECEIPT',
      },
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
        .select([
          'e.id',
          'e.mcdItemId',
          'e.fileName',
          'e.filePath',
          'e.fileType',
          'e.fileSize',
          'e.notes',
          'e.createdAt',
        ])
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
        throw new BadRequestException(
          'This item was uploaded by CRM and cannot be modified by client',
        );
      if (mcdItem.status === 'APPROVED' || mcdItem.status === 'VERIFIED')
        throw new BadRequestException(
          'Cannot upload for an already approved/verified item',
        );
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
        await this.email.sendAuditMail(
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
    _docId: string,
    _dto: { text: string; visibility: string },
  ) {
    this.assertRole(user, ['AUDITOR']);
    throw new ForbiddenException('Auditors cannot review compliance documents');
  }
}
