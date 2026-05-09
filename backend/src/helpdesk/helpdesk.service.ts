import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { HelpdeskTicketEntity } from './entities/helpdesk-ticket.entity';
import { HelpdeskMessageEntity } from './entities/helpdesk-message.entity';
import { HelpdeskMessageFileEntity } from './entities/helpdesk-message-file.entity';
import { ReqUser } from '../access/access-scope.service';

export type CreateTicketDto = {
  category: string;
  subCategory?: string | null;
  branchId?: string | null;
  employeeRef?: string | null;
  priority?: string | null;
  description: string;
};

export type PostMessageDto = { message: string };

export type AssignTicketDto = { assignedToUserId: string | null };

export type UpdateTicketStatusDto = { status: string };

export const HELP_DESK_STATUS = [
  'OPEN',
  'IN_PROGRESS',
  'AWAITING_CLIENT',
  'RESOLVED',
  'CLOSED',
] as const;
export const HELP_DESK_PRIORITY = [
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL',
] as const;

// PF Team can only act on PF/ESI/PAYSLIP tickets. Other categories
// (e.g. COMPLIANCE / GENERIC) belong to ADMIN/CRM queues.
export const PF_TEAM_CATEGORIES = ['PF', 'ESI', 'PAYSLIP'] as const;

@Injectable()
export class HelpdeskService {
  constructor(
    @InjectRepository(HelpdeskTicketEntity)
    private readonly ticketRepo: Repository<HelpdeskTicketEntity>,
    @InjectRepository(HelpdeskMessageEntity)
    private readonly msgRepo: Repository<HelpdeskMessageEntity>,
    @InjectRepository(HelpdeskMessageFileEntity)
    private readonly fileRepo: Repository<HelpdeskMessageFileEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // --- Real implementations matching controller contracts ---

  /** Admin: paginated + searchable ticket list */
  async adminListTickets(q: Record<string, string>) {
    const page = Math.max(Number(q?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(q?.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.client', 'c')
      .leftJoin('users', 'creatorUser', 'creatorUser.id = t.created_by_user_id')
      .addSelect('creatorUser.name', 'creatorName')
      .leftJoin(
        'users',
        'assigneeUser',
        'assigneeUser.id = t.assigned_to_user_id',
      )
      .addSelect('assigneeUser.name', 'assigneeName');

    if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
    if (q?.clientId) qb.andWhere('t.client_id = :cid', { cid: q.clientId });
    if (q?.category) qb.andWhere('t.category = :cat', { cat: q.category });
    if (q?.priority) qb.andWhere('t.priority = :pri', { pri: q.priority });
    if (q?.search) {
      qb.andWhere(
        '(t.description ILIKE :search OR t.category ILIKE :search OR t.employee_ref ILIKE :search OR c.client_name ILIKE :search)',
        { search: `%${q.search}%` },
      );
    }

    qb.orderBy('t.created_at', 'DESC');

    const total = await qb.getCount();
    const raw = await qb.offset(offset).limit(limit).getRawAndEntities();

    const data = raw.entities.map((ticket, i) => ({
      ...ticket,
      creatorName: raw.raw[i]?.creatorName ?? null,
      assigneeName: raw.raw[i]?.assigneeName ?? null,
    }));

    return { data, total, page, limit };
  }

  /** Admin: dashboard stats */
  async adminStats() {
    const all = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('t.priority', 'priority')
      .addSelect('t.sla_due_at', 'slaDueAt')
      .addSelect('t.category', 'category')
      .getRawMany();

    const now = Date.now();
    let total = 0,
      open = 0,
      inProgress = 0,
      awaitingClient = 0,
      resolved = 0,
      closed = 0,
      slaBreached = 0;
    const catMap = new Map<string, number>();

    for (const r of all) {
      total++;
      if (r.status === 'OPEN') open++;
      else if (r.status === 'IN_PROGRESS') inProgress++;
      else if (r.status === 'AWAITING_CLIENT') awaitingClient++;
      else if (r.status === 'RESOLVED') resolved++;
      else if (r.status === 'CLOSED') closed++;

      if (
        r.slaDueAt &&
        new Date(r.slaDueAt).getTime() < now &&
        !['RESOLVED', 'CLOSED'].includes(r.status)
      ) {
        slaBreached++;
      }

      catMap.set(r.category, (catMap.get(r.category) || 0) + 1);
    }

    const categories = [...catMap.entries()].map(([label, count]) => ({
      label,
      count,
    }));

    return {
      total,
      open,
      inProgress,
      awaitingClient,
      resolved,
      closed,
      slaBreached,
      categories,
    };
  }

  /** Admin: assign ticket to a user */
  async assignTicket(ticketId: string, dto: AssignTicketDto) {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (dto.assignedToUserId) {
      const [assignee] = await this.dataSource.query(
        `SELECT u.id, r.code AS "roleCode"
           FROM users u
           INNER JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1
            AND u.deleted_at IS NULL
            AND u.is_active = true
          LIMIT 1`,
        [dto.assignedToUserId],
      );
      if (!assignee) throw new BadRequestException('Assignee not found');
      if (
        (PF_TEAM_CATEGORIES as readonly string[]).includes(t.category) &&
        assignee.roleCode !== 'PF_TEAM'
      ) {
        throw new BadRequestException('PF tickets must be assigned to PF Team');
      }
    }
    t.assignedToUserId = dto.assignedToUserId;
    if (t.status === 'OPEN' && dto.assignedToUserId) {
      t.status = 'IN_PROGRESS';
    }
    return this.ticketRepo.save(t);
  }

  async listTickets(user: ReqUser, q: Record<string, string>) {
    // For CRM users, scope to their assigned clients
    if (user?.roleCode === 'CRM') {
      return this.crmListTickets(user, q);
    }
    // For CLIENT users, scope to their client
    if (user?.roleCode === 'CLIENT' && user.clientId) {
      const qb = this.ticketRepo
        .createQueryBuilder('t')
        .where('t.client_id = :clientId', { clientId: user.clientId });
      if (q?.branchId)
        qb.andWhere('t.branch_id = :branchId', { branchId: q.branchId });
      if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
      if (q?.category) qb.andWhere('t.category = :cat', { cat: q.category });
      qb.orderBy('t.created_at', 'DESC');
      return qb.getMany();
    }
    // For PF_TEAM, restrict to PF/ESI/PAYSLIP categories and either
    // unassigned tickets (queue) or those assigned to this PF user.
    if (user?.roleCode === 'PF_TEAM') {
      const qb = this.ticketRepo
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.client', 'c')
        .where('t.category IN (:...cats)', {
          cats: [...PF_TEAM_CATEGORIES],
        })
        .andWhere(
          '(t.assigned_to_user_id IS NULL OR t.assigned_to_user_id = :uid)',
          { uid: user.id },
        );
      if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
      if (q?.clientId) qb.andWhere('t.client_id = :c', { c: q.clientId });
      if (q?.category) {
        if (!(PF_TEAM_CATEGORIES as readonly string[]).includes(q.category)) {
          return [];
        }
        qb.andWhere('t.category = :cat', { cat: q.category });
      }
      qb.orderBy('t.created_at', 'DESC');
      return qb.getMany();
    }
    // For ADMIN, return all tickets with client info
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.client', 'c');
    if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
    if (q?.clientId) qb.andWhere('t.client_id = :c', { c: q.clientId });
    if (q?.category) qb.andWhere('t.category = :cat', { cat: q.category });
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  async createTicket(user: ReqUser, dto: CreateTicketDto) {
    return this.clientCreateTicket(user, dto);
  }

  async uploadFile(user: ReqUser, ticketId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
    if (user?.roleCode === 'CRM') {
      const clientIds = await this.crmAssignedClientIds(user.id);
      if (!clientIds.includes(t.clientId))
        throw new ForbiddenException('Not assigned to this client');
    }
    if (user?.roleCode === 'PF_TEAM') {
      this.assertPfTeamScope(t, user.id, true);
    }
    this.assertEmployeeTicketScope(t, user);
    // Create a system message for the file upload, then attach the file
    const message = this.msgRepo.create({
      message: `File uploaded: ${file.originalname ?? file.filename ?? 'file'}`,
      ticketId,
      senderUserId: user.id,
    });
    const savedMsg = await this.msgRepo.save(message);

    const entity = this.fileRepo.create({
      messageId: savedMsg.id,
      fileName: file.originalname ?? file.filename ?? 'file',
      filePath: file.path ?? (file as { location?: string }).location ?? '',
      fileType: file.mimetype ?? 'application/octet-stream',
      fileSize: String(file.size ?? 0),
    });
    return this.fileRepo.save(entity);
  }

  async getMessages(user: ReqUser, ticketId: string) {
    return this.listMessages(user, ticketId);
  }

  private async findCrmAssignmentTable(): Promise<{
    table: string;
    crmCol: string;
    clientCol: string;
    assignmentTypeCol?: string;
    assignmentTypeValue?: string;
  } | null> {
    const candidates = [
      // ✅ Your schema (preferred)
      {
        table: 'client_assignments_current',
        crmCol: 'assigned_to_user_id',
        clientCol: 'client_id',
        assignmentTypeCol: 'assignment_type',
        assignmentTypeValue: 'CRM',
      },

      // fallback options if needed later
      {
        table: 'client_assignment_current',
        crmCol: 'assigned_to_user_id',
        clientCol: 'client_id',
        assignmentTypeCol: 'assignment_type',
        assignmentTypeValue: 'CRM',
      },
      {
        table: 'client_assignments',
        crmCol: 'assigned_to_user_id',
        clientCol: 'client_id',
        assignmentTypeCol: 'assignment_type',
        assignmentTypeValue: 'CRM',
      },
    ];

    for (const c of candidates) {
      const exists = await this.dataSource.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
        [c.table],
      );
      if (!exists?.length) continue;

      const cols = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
        [c.table],
      );
      const set = new Set(
        (cols || []).map((r: { column_name: string }) => r.column_name),
      );

      if (set.has(c.crmCol) && set.has(c.clientCol)) {
        // assignment_type is optional but present in your table
        return {
          table: c.table,
          crmCol: c.crmCol,
          clientCol: c.clientCol,
          assignmentTypeCol: set.has(c.assignmentTypeCol ?? '')
            ? c.assignmentTypeCol
            : undefined,
          assignmentTypeValue: c.assignmentTypeValue,
        };
      }
    }

    return null;
  }

  private async crmAssignedClientIds(crmUserId: string): Promise<string[]> {
    const meta = await this.findCrmAssignmentTable();
    if (!meta) return [];

    const where: string[] = [`${meta.crmCol} = $1`];
    const params: unknown[] = [crmUserId];

    if (meta.assignmentTypeCol && meta.assignmentTypeValue) {
      where.push(`${meta.assignmentTypeCol} = $2`);
      params.push(meta.assignmentTypeValue);
    }

    const sql = `
      SELECT ${meta.clientCol} AS "clientId"
      FROM public.${meta.table}
      WHERE ${where.join(' AND ')}
    `;

    const rows = await this.dataSource.query(sql, params);
    return (rows || [])
      .map((r: { clientId: string }) => r.clientId)
      .filter(Boolean);
  }

  async crmListTickets(user: ReqUser, q: Record<string, string>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const clientIds = await this.crmAssignedClientIds(user.id);
    if (clientIds.length === 0) return [];
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .where('t.client_id IN (:...ids)', { ids: clientIds });
    if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
    if (q?.clientId) qb.andWhere('t.client_id = :c', { c: q.clientId });
    if (q?.category) qb.andWhere('t.category = :cat', { cat: q.category });
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  async getTicket(user: ReqUser, ticketId: string) {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
    if (user?.roleCode === 'CRM') {
      const clientIds = await this.crmAssignedClientIds(user.id);
      if (!clientIds.includes(t.clientId))
        throw new ForbiddenException('Not assigned to this client');
    }
    if (user?.roleCode === 'PF_TEAM') {
      this.assertPfTeamScope(t, user.id);
    }
    this.assertEmployeeTicketScope(t, user);
    return t;
  }

  async clientCreateTicket(user: ReqUser, dto: CreateTicketDto) {
    const category = String(dto.category || '').toUpperCase();
    const priority = String(dto.priority || 'NORMAL').toUpperCase();
    const allowedCategories = [
      ...PF_TEAM_CATEGORIES,
      'COMPLIANCE',
      'GENERIC',
    ];
    if (!allowedCategories.includes(category)) {
      throw new BadRequestException('Invalid ticket category');
    }
    if (!(HELP_DESK_PRIORITY as readonly string[]).includes(priority)) {
      throw new BadRequestException('Invalid ticket priority');
    }
    const now = new Date();
    const hours =
      priority === 'CRITICAL'
        ? 24
        : priority === 'HIGH'
          ? 48
          : priority === 'LOW'
            ? 120
            : 72; // NORMAL = 72h
    const slaDue = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const ticket = this.ticketRepo.create({
      ...dto,
      category,
      clientId: user.clientId!,
      createdByUserId: user.id,
      status: 'OPEN',
      priority,
      slaDueAt: slaDue,
    });
    return this.ticketRepo.save(ticket);
  }

  async pfTeamUpdateStatus(
    user: ReqUser,
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ) {
    if (!(HELP_DESK_STATUS as readonly string[]).includes(dto.status))
      throw new BadRequestException('Invalid status');
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');

    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
    if (user?.roleCode === 'PF_TEAM') {
      this.assertPfTeamScope(t, user.id, true);
      this.assertPfStatusTransition(t.status, dto.status);
    }
    t.status = dto.status;
    return this.ticketRepo.save(t);
  }

  async updateTicketStatusScoped(
    user: ReqUser,
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ) {
    if (!dto?.status) throw new BadRequestException('status required');
    if (!(HELP_DESK_STATUS as readonly string[]).includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    // Scope rules:
    if (user.roleCode === 'CRM') {
      const ids = await this.crmAssignedClientIds(user.id);
      if (!ids.includes(t.clientId))
        throw new ForbiddenException('Not assigned to this client');
    }
    if (user.roleCode === 'PF_TEAM') {
      this.assertPfTeamScope(t, user.id, true);
      this.assertPfStatusTransition(t.status, dto.status);
    }
    // ADMIN allowed unconditionally
    t.status = dto.status;
    return this.ticketRepo.save(t);
  }

  /**
   * PF Team scope: ticket category must be a PF/ESI/PAYSLIP type, and if the
   * ticket is already assigned, it must be assigned to the requesting PF user.
   */
  private assertPfTeamScope(
    t: HelpdeskTicketEntity,
    userId: string,
    requireAssignment = false,
  ) {
    if (
      !(PF_TEAM_CATEGORIES as readonly string[]).includes(t.category)
    ) {
      throw new ForbiddenException('Ticket is not a PF Team category');
    }
    if (t.assignedToUserId && t.assignedToUserId !== userId) {
      throw new ForbiddenException('Ticket assigned to another PF user');
    }
    if (requireAssignment && !t.assignedToUserId) {
      throw new ForbiddenException('Claim or assign the ticket before updating');
    }
  }

  private assertPfStatusTransition(current: string, next: string) {
    if (next === 'CLOSED') {
      throw new BadRequestException(
        'PF Team must resolve the ticket before admin/client closure',
      );
    }
    if (current === 'OPEN' && next === 'RESOLVED') {
      throw new BadRequestException('Move ticket to IN_PROGRESS before resolve');
    }
  }

  private assertEmployeeTicketScope(t: HelpdeskTicketEntity, user: ReqUser) {
    if (user.roleCode !== 'EMPLOYEE') return;
    if (t.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }
  }

  /**
   * Used by FilesService when authorizing a helpdesk attachment download.
   * Loads the ticket that owns the given message id so the caller can
   * enforce role-based scope (CLIENT tenant match, CRM assignment,
   * PF_TEAM category + assignment).
   */
  async getTicketForMessage(
    messageId: string,
  ): Promise<HelpdeskTicketEntity | null> {
    const msg = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!msg) return null;
    return this.ticketRepo.findOne({ where: { id: msg.ticketId } });
  }

  async listMessages(user: ReqUser, ticketId: string) {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
    if (user?.roleCode === 'CRM') {
      const clientIds = await this.crmAssignedClientIds(user.id);
      if (!clientIds.includes(t.clientId))
        throw new ForbiddenException('Not assigned to this client');
    }
    if (user?.roleCode === 'PF_TEAM') {
      this.assertPfTeamScope(t, user.id);
    }
    this.assertEmployeeTicketScope(t, user);
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .leftJoin('users', 'u', 'u.id = m.sender_user_id')
      .addSelect('u.name', 'senderName')
      .where('m.ticket_id = :id', { id: ticketId });
    qb.orderBy('m.created_at', 'ASC');
    const raw = await qb.getRawAndEntities();
    return raw.entities.map((msg, i) => ({
      ...msg,
      senderName: raw.raw[i]?.senderName ?? null,
    }));
  }

  async postMessage(user: ReqUser, ticketId: string, dto: PostMessageDto) {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
    if (user?.roleCode === 'CRM') {
      const clientIds = await this.crmAssignedClientIds(user.id);
      if (!clientIds.includes(t.clientId))
        throw new ForbiddenException('Not assigned to this client');
    }
    if (user?.roleCode === 'PF_TEAM') {
      this.assertPfTeamScope(t, user.id, true);
    }
    this.assertEmployeeTicketScope(t, user);
    const message = this.msgRepo.create({
      message: dto.message,
      ticketId,
      senderUserId: user.id,
    });
    return this.msgRepo.save(message);
  }

  // ── ESS (Employee) Helpdesk ────────────────────────────
  async essListTickets(user: ReqUser, q: Record<string, string>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .where('t.created_by_user_id = :uid', { uid: user.id });
    if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
    if (q?.category) qb.andWhere('t.category = :cat', { cat: q.category });
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  async essCreateTicket(user: ReqUser, dto: CreateTicketDto) {
    const category = String(dto.category || '').toUpperCase();
    const priority = String(dto.priority || 'NORMAL').toUpperCase();
    const allowedCategories = ['PF', 'ESI', 'PAYSLIP'];
    if (!allowedCategories.includes(category)) {
      throw new BadRequestException(
        `Category must be one of: ${allowedCategories.join(', ')}`,
      );
    }
    if (!(HELP_DESK_PRIORITY as readonly string[]).includes(priority)) {
      throw new BadRequestException('Invalid ticket priority');
    }
    const now = new Date();
    const hours =
      priority === 'CRITICAL'
        ? 24
        : priority === 'HIGH'
          ? 48
          : priority === 'LOW'
            ? 120
            : 72;
    const slaDue = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const ticket = this.ticketRepo.create({
      category,
      subCategory: dto.subCategory ?? null,
      description: dto.description,
      clientId: user.clientId!,
      branchId: user.branchIds?.[0] ?? null,
      employeeRef: user.employeeId ?? null,
      createdByUserId: user.id,
      status: 'OPEN',
      priority,
      slaDueAt: slaDue,
    });
    return this.ticketRepo.save(ticket);
  }

  async essGetTicket(user: ReqUser, ticketId: string) {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (t.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }
    return t;
  }
}
