// ...existing code...
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
  async listTickets(user: any, q: any) {
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
    // For ADMIN/PF_TEAM, return all tickets (with optional filters)
    const qb = this.ticketRepo.createQueryBuilder('t');
    if (q?.status) qb.andWhere('t.status = :s', { s: q.status });
    if (q?.clientId) qb.andWhere('t.client_id = :c', { c: q.clientId });
    if (q?.category) qb.andWhere('t.category = :cat', { cat: q.category });
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  async createTicket(user: any, dto: any) {
    return this.clientCreateTicket(user, dto);
  }

  async uploadFile(user: any, ticketId: string, file: any) {
    if (!file) throw new BadRequestException('File is required');
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
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
      filePath: file.path ?? file.location ?? '',
      fileType: file.mimetype ?? 'application/octet-stream',
      fileSize: file.size ?? 0,
    });
    return this.fileRepo.save(entity);
  }

  async getMessages(user: any, ticketId: string) {
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
      const set = new Set((cols || []).map((r: any) => r.column_name));

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
    const params: any[] = [crmUserId];

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
    return (rows || []).map((r: any) => r.clientId).filter(Boolean);
  }

  async crmListTickets(user: any, q: any) {
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

  async getTicket(user: any, ticketId: string) {
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
    return t;
  }

  async clientCreateTicket(user: any, dto: CreateTicketDto) {
    const now = new Date();
    const hours =
      (dto.priority ?? 'NORMAL') === 'CRITICAL'
        ? 24
        : (dto.priority ?? 'NORMAL') === 'HIGH'
          ? 48
          : (dto.priority ?? 'NORMAL') === 'LOW'
            ? 120
            : 72; // NORMAL = 72h
    const slaDue = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const ticket = this.ticketRepo.create({
      ...dto,
      clientId: user.clientId,
      createdByUserId: user.id,
      status: 'OPEN',
      priority: dto.priority ?? 'NORMAL',
      slaDueAt: slaDue,
    });
    return this.ticketRepo.save(ticket);
  }

  async pfTeamUpdateStatus(
    user: any,
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ) {
    if (!HELP_DESK_STATUS.includes(dto.status as any))
      throw new BadRequestException('Invalid status');
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');

    if (user?.roleCode === 'CLIENT' && user.clientId !== t.clientId) {
      throw new ForbiddenException('Invalid client');
    }
    t.status = dto.status;
    return this.ticketRepo.save(t);
  }

  async updateTicketStatusScoped(
    user: any,
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ) {
    if (!dto?.status) throw new BadRequestException('status required');
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) throw new BadRequestException('Ticket not found');
    // Scope rules:
    if (user.roleCode === 'CRM') {
      const ids = await this.crmAssignedClientIds(user.id);
      if (!ids.includes(t.clientId))
        throw new ForbiddenException('Not assigned to this client');
    }
    // PF_TEAM / ADMIN allowed
    t.status = dto.status;
    return this.ticketRepo.save(t);
  }

  async listMessages(user: any, ticketId: string) {
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
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.ticket_id = :id', { id: ticketId });
    qb.orderBy('m.created_at', 'DESC');
    return qb.getMany();
  }

  async postMessage(user: any, ticketId: string, dto: PostMessageDto) {
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
    const message = this.msgRepo.create({
      message: dto.message,
      ticketId,
      senderUserId: user.id,
    });
    return this.msgRepo.save(message);
  }
}
