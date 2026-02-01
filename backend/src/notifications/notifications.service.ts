import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationMessageEntity } from './entities/notification-message.entity';
import { NotificationReadEntity } from './entities/notification-read.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ReplyNotificationDto } from './dto/reply-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ClientAssignment } from '../assignments/entities/client-assignment.entity';

type RoleCode = 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'CONTRACTOR' | 'CEO' | 'CCO';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NotificationEntity)
    private readonly threadsRepo: Repository<NotificationEntity>,
    @InjectRepository(NotificationMessageEntity)
    private readonly messagesRepo: Repository<NotificationMessageEntity>,
    @InjectRepository(NotificationReadEntity)
    private readonly readsRepo: Repository<NotificationReadEntity>,
    @InjectRepository(ClientAssignment)
    private readonly assignmentsRepo: Repository<ClientAssignment>,
  ) {}

  // -------------------------
  // Routing helpers
  // -------------------------

  private async findAnyAdminUserId(): Promise<string> {
    const rows = await this.dataSource.query(
      `
      SELECT u.id
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.code = 'ADMIN' AND u.is_active = true
      ORDER BY u.created_at ASC
      LIMIT 1
      `,
    );
    const id = rows?.[0]?.id as string | undefined;
    if (!id) throw new BadRequestException('No ADMIN user found to route TECHNICAL query');
    return id;
  }

  private async resolveAssigneeUserId(dto: CreateNotificationDto): Promise<string> {
    // TECHNICAL always goes to Admin
    if (dto.queryType === 'TECHNICAL') return this.findAnyAdminUserId();

    // If there is no client context, route to Admin as safe fallback
    if (!dto.clientId) return this.findAnyAdminUserId();

    const assignment = await this.assignmentsRepo.findOne({ where: { clientId: dto.clientId, endDate: IsNull() } });

    if (dto.queryType === 'COMPLIANCE') {
      if (assignment?.crmUserId) return assignment.crmUserId;
      return this.findAnyAdminUserId();
    }

    if (dto.queryType === 'AUDIT') {
      if (assignment?.auditorUserId) return assignment.auditorUserId;
      return this.findAnyAdminUserId();
    }

    // GENERAL -> Admin by default (keeps behaviour predictable)
    return this.findAnyAdminUserId();
  }

  // -------------------------
  // Ticket creation
  // -------------------------

  async createTicket(
    actorUserId: string,
    _actorRole: RoleCode,
    dto: CreateNotificationDto,
  ): Promise<{ threadId: string; assignedTo: { userId: string | null; roleCode: RoleCode | null }; status: 'OPEN' | 'CLOSED' }> {
    const toUserId = await this.resolveAssigneeUserId(dto);

    return this.dataSource.transaction(async (manager) => {
      const thread = manager.create(NotificationEntity, {
        title: dto.subject,
        queryType: dto.queryType,
        priority: 'NORMAL',
        status: 'OPEN',
        fromUserId: actorUserId,
        toUserId,
        clientId: dto.clientId ?? null,
        branchId: dto.branchId ?? null,
      });
      const saved = await manager.save(NotificationEntity, thread);

      const firstMsg = manager.create(NotificationMessageEntity, {
        threadId: saved.id,
        senderUserId: actorUserId,
        message: dto.message,
        attachmentPath: null,
      });
      await manager.save(NotificationMessageEntity, firstMsg);

      await manager.save(NotificationReadEntity, {
        notificationId: saved.id,
        userId: actorUserId,
        lastReadAt: new Date(),
      });

      // Determine role of assignee (via DB)
      const roleRows = await manager.query(
        `
        SELECT r.code
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
        LIMIT 1
        `,
        [toUserId],
      );
      const roleCode = (roleRows?.[0]?.code ?? null) as RoleCode | null;

      return {
        threadId: saved.id,
        assignedTo: { userId: toUserId, roleCode },
        status: 'OPEN',
      };
    });
  }

  // -------------------------
  // Shared inbox APIs
  // -------------------------

  private normalizePaging(q: any) {
    const page = Math.max(1, Number(q?.page ?? 1));
    const limit = Math.min(100, Math.max(10, Number(q?.limit ?? 20)));
    return { page, limit, skip: (page - 1) * limit };
  }

  private canAccessThread(user: any, thread: NotificationEntity): boolean {
    const role: RoleCode | undefined = user?.roleCode;
    const userId: string | undefined = user?.id;
    if (!role || !userId) return false;
    if (role === 'ADMIN' || role === 'CEO' || role === 'CCO') return true;
    return thread.fromUserId === userId || thread.toUserId === userId;
  }

  private async listThreadsRaw(whereSql: string, params: any[], paging: { skip: number; limit: number }) {
    const baseSql = `
      FROM notification_threads t
      LEFT JOIN users fu ON fu.id = t.from_user_id
      LEFT JOIN roles fr ON fr.id = fu.role_id
      LEFT JOIN users tu ON tu.id = t.to_user_id
      LEFT JOIN roles tr ON tr.id = tu.role_id
      LEFT JOIN LATERAL (
        SELECT MAX(m.created_at) AS last_message_at
        FROM notification_messages m
        WHERE m.thread_id = t.id
      ) lm ON TRUE
      ${whereSql}
    `;

    const countSql = `SELECT COUNT(*)::int AS n ${baseSql}`;

    const rowsSql = `
      SELECT
        t.id,
        t.query_type AS "queryType",
        t.title AS subject,
        t.client_id AS "clientId",
        t.branch_id AS "branchId",
        t.status,
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt",
        json_build_object(
          'id', fu.id,
          'name', fu.name,
          'roleCode', fr.code,
          'email', fu.email
        ) AS "createdBy",
        json_build_object(
          'id', tu.id,
          'name', tu.name,
          'roleCode', tr.code,
          'email', tu.email
        ) AS "assignedTo",
        COALESCE(lm.last_message_at, t.created_at) AS "lastMessageAt"
      ${baseSql}
      ORDER BY t.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countRow] = await this.dataSource.query(countSql, params);
    const total = countRow?.n ?? 0;
    const data = await this.dataSource.query(rowsSql, [...params, paging.limit, paging.skip]);
    return { total, data };
  }

  async listTicketsForUser(user: any, q: any) {
    const { page, limit, skip } = this.normalizePaging(q);
    const status = q?.status;
    const unreadOnly = Number(q?.unreadOnly ?? 0) === 1;

    const params: any[] = [];
    const wheres: string[] = [];

    // Scope:
    // - ADMIN/CEO/CCO: all
    // - others: where assigned or created
    if (['ADMIN', 'CEO', 'CCO'].includes(String(user.roleCode))) {
      // no user filter known
    } else {
      params.push(user.id);
      wheres.push(`(t.to_user_id = $1 OR t.from_user_id = $1)`);
    }

    if (status) {
      params.push(status);
      wheres.push(`t.status = $${params.length}`);
    }

    if (unreadOnly) {
      params.push(user.id);
      wheres.push(`NOT EXISTS (
        SELECT 1 FROM notification_reads r
        WHERE r.notification_id = t.id AND r.user_id = $${params.length}
      )`);
    }

    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const { total, data } = await this.listThreadsRaw(whereSql, params, { skip, limit });
    return { page, limit, total, data };
  }

  async listTicketsCreatedBy(user: any, q: any) {
    const { page, limit, skip } = this.normalizePaging(q);
    const status = q?.status;
    const unreadOnly = Number(q?.unreadOnly ?? 0) === 1;

    const params: any[] = [user.id];
    const wheres: string[] = [`t.from_user_id = $1`];

    if (status) {
      params.push(status);
      wheres.push(`t.status = $${params.length}`);
    }

    if (unreadOnly) {
      params.push(user.id);
      wheres.push(`NOT EXISTS (
        SELECT 1 FROM notification_reads r
        WHERE r.notification_id = t.id AND r.user_id = $${params.length}
      )`);
    }

    const whereSql = `WHERE ${wheres.join(' AND ')}`;
    const { total, data } = await this.listThreadsRaw(whereSql, params, { skip, limit });
    return { page, limit, total, data };
  }

  async getThreadDetailForUser(user: any, threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread)) throw new BadRequestException('Access denied');

    const messages = await this.dataSource.query(
      `
      SELECT
        m.id,
        m.thread_id AS "threadId",
        m.message,
        m.created_at AS "createdAt",
        json_build_object(
          'id', u.id,
          'name', u.name,
          'roleCode', r.code,
          'email', u.email
        ) AS "from"
      FROM notification_messages m
      LEFT JOIN users u ON u.id = m.sender_user_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE m.thread_id = $1
      ORDER BY m.created_at ASC
      `,
      [threadId],
    );

    await this.markRead(threadId, user.id);

    return {
      thread: {
        id: thread.id,
        status: thread.status,
        queryType: thread.queryType,
        clientId: thread.clientId,
        branchId: thread.branchId,
        subject: thread.title,
      },
      messages,
    };
  }

  async replyAsUser(user: any, threadId: string, dto: ReplyNotificationDto) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread)) throw new BadRequestException('Access denied');

    await this.dataSource.transaction(async (manager) => {
      const msg = manager.create(NotificationMessageEntity, {
        threadId,
        senderUserId: user.id,
        message: dto.message,
        attachmentPath: dto.attachmentPath ?? null,
      });
      await manager.save(NotificationMessageEntity, msg);

      thread.status = thread.status === 'CLOSED' ? 'OPEN' : 'OPEN';
      thread.updatedAt = new Date();
      await manager.save(NotificationEntity, thread);

      await manager.save(NotificationReadEntity, {
        notificationId: threadId,
        userId: user.id,
        lastReadAt: new Date(),
      });
    });

    return { ok: true };
  }

  async closeThread(user: any, threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread)) throw new BadRequestException('Access denied');
    thread.status = 'CLOSED';
    thread.updatedAt = new Date();
    await this.threadsRepo.save(thread);
    return { status: 'CLOSED' };
  }

  async reopenThread(user: any, threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread)) throw new BadRequestException('Access denied');
    thread.status = 'OPEN';
    thread.updatedAt = new Date();
    await this.threadsRepo.save(thread);
    return { status: 'OPEN' };
  }

  // -------------------------
  // Admin APIs
  // -------------------------

  async listTicketsForAdmin(adminUserId: string, q: ListNotificationsDto) {
    const { page, limit, skip } = this.normalizePaging(q);
    const params: any[] = [];
    const wheres: string[] = [];

    if (q.status) {
      params.push(q.status);
      wheres.push(`t.status = $${params.length}`);
    }
    if (q.queryType) {
      params.push(q.queryType);
      wheres.push(`t.query_type = $${params.length}`);
    }
    if (q.clientId) {
      params.push(q.clientId);
      wheres.push(`t.client_id = $${params.length}`);
    }
    if (q.assignedToUserId) {
      params.push(q.assignedToUserId);
      wheres.push(`t.to_user_id = $${params.length}`);
    }
    if (q.unreadOnly === 1) {
      params.push(adminUserId);
      wheres.push(`NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = t.id AND r.user_id = $${params.length})`);
    }

    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const { total, data } = await this.listThreadsRaw(whereSql, params, { skip, limit });

    return { page, limit, total, data, rows: data };
  }

  async getTicketDetailForAdmin(threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    const messages = await this.messagesRepo.find({ where: { threadId }, order: { createdAt: 'ASC' as any } });
    return { ticket: thread, messages };
  }

  async replyAsAdmin(adminUserId: string, _adminRole: RoleCode, threadId: string, dto: ReplyNotificationDto) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    await this.dataSource.transaction(async (manager) => {
      const msg = manager.create(NotificationMessageEntity, {
        threadId,
        senderUserId: adminUserId,
        message: dto.message,
        attachmentPath: dto.attachmentPath ?? null,
      });
      await manager.save(NotificationMessageEntity, msg);
      thread.status = thread.status === 'CLOSED' ? 'OPEN' : 'OPEN';
      thread.updatedAt = new Date();
      await manager.save(NotificationEntity, thread);
      await manager.save(NotificationReadEntity, {
        notificationId: threadId,
        userId: adminUserId,
        lastReadAt: new Date(),
      });
    });
    return { ok: true };
  }

  async markRead(threadId: string, userId: string) {
    const existing = await this.readsRepo.findOne({ where: { notificationId: threadId, userId } });
    if (existing) {
      existing.lastReadAt = new Date();
      await this.readsRepo.save(existing);
      return { ok: true };
    }
    await this.readsRepo.save({ notificationId: threadId, userId, lastReadAt: new Date() } as any);
    return { ok: true };
  }

  async setStatus(threadId: string, status: string) {
    const allowed = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (!allowed.includes(status)) throw new BadRequestException('Invalid status');
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    thread.status = status;
    thread.updatedAt = new Date();
    await this.threadsRepo.save(thread);
    return { ok: true };
  }
}
