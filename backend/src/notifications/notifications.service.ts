import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationMessageEntity } from './entities/notification-message.entity';
import { NotificationReadEntity } from './entities/notification-read.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ReplyNotificationDto } from './dto/reply-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { RaiseNotificationDto } from './dto/raise-notification.dto';
import { ClientAssignment } from '../assignments/entities/client-assignment.entity';
import { ReqUser } from '../access/access-scope.service';

type RoleCode =
  | 'ADMIN'
  | 'CRM'
  | 'AUDITOR'
  | 'CLIENT'
  | 'CONTRACTOR'
  | 'CEO'
  | 'CCO';
type UserCtx = { id: string; role: string };

type NotificationsListQuery = {
  page?: string | number;
  limit?: string | number;
  status?: string;
  unreadOnly?: string | number;
};

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
      WHERE r.code = 'ADMIN' AND u.is_active = true AND u.deleted_at IS NULL
      ORDER BY u.created_at ASC
      LIMIT 1
      `,
    );
    const id = rows?.[0]?.id as string | undefined;
    if (!id)
      throw new BadRequestException(
        'No ADMIN user found to route TECHNICAL query',
      );
    return id;
  }

  private async resolveAssigneeUserId(
    dto: CreateNotificationDto,
  ): Promise<string> {
    // TECHNICAL always goes to Admin
    if (dto.queryType === 'TECHNICAL') return this.findAnyAdminUserId();

    // If there is no client context, route to Admin as safe fallback
    if (!dto.clientId) return this.findAnyAdminUserId();

    const assignment = await this.assignmentsRepo.findOne({
      where: { clientId: dto.clientId, endDate: IsNull() },
    });

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
  // Ticket lookup
  // -------------------------

  async findThreadsBySubject(
    subject: string,
    clientId?: string,
  ): Promise<NotificationEntity[]> {
    const qb = this.threadsRepo
      .createQueryBuilder('t')
      .where('t.subject = :subject', { subject });

    if (clientId) {
      qb.andWhere('t.clientId = :clientId', { clientId });
    }

    return qb.orderBy('t.createdAt', 'DESC').getMany();
  }

  // -------------------------
  // Ticket creation
  // -------------------------

  async createTicket(
    actorUserId: string,
    _actorRole: string,
    dto: CreateNotificationDto,
  ): Promise<{
    threadId: string;
    assignedTo: { userId: string | null; roleCode: RoleCode | null };
    status: 'OPEN' | 'CLOSED';
  }> {
    const toUserId = await this.resolveAssigneeUserId(dto);

    return this.dataSource.transaction(async (manager) => {
      const notification = manager.create(NotificationEntity, {
        subject: dto.subject,
        queryType: dto.queryType,
        priority: 2,
        status: 'OPEN',
        createdByUserId: actorUserId,
        createdByRole: _actorRole,
        clientId: dto.clientId ?? null,
        branchId: dto.branchId ?? null,
        assignedToUserId: toUserId,
        assignedToRole: null,
      });
      const saved = await manager.save(NotificationEntity, notification);

      const firstMsg = manager.create(NotificationMessageEntity, {
        notificationId: saved.id,
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

  private normalizePaging(q: NotificationsListQuery) {
    const page = Math.max(1, Number(q?.page ?? 1));
    const limit = Math.min(100, Math.max(10, Number(q?.limit ?? 20)));
    return { page, limit, skip: (page - 1) * limit };
  }

  private canAccessThread(user: ReqUser, thread: NotificationEntity): boolean {
    const role: RoleCode | undefined = user?.roleCode as RoleCode | undefined;
    const userId: string | undefined = user?.id;
    if (!role || !userId) return false;
    if (role === 'ADMIN' || role === 'CEO' || role === 'CCO') return true;
    return (
      thread.createdByUserId === userId || thread.assignedToUserId === userId
    );
  }

  private async listThreadsRaw(
    whereSql: string,
    params: unknown[],
    paging: { skip: number; limit: number },
  ) {
    const baseSql = `
      FROM notifications t
      LEFT JOIN users fu ON fu.id = t.created_by_user_id
      LEFT JOIN roles fr ON fr.id = fu.role_id
      LEFT JOIN users tu ON tu.id = t.assigned_to_user_id
      LEFT JOIN roles tr ON tr.id = tu.role_id
      LEFT JOIN clients c ON c.id = t.client_id
      LEFT JOIN client_branches b ON b.id = t.branch_id
      LEFT JOIN LATERAL (
        SELECT MAX(m.created_at) AS last_message_at
        FROM notification_messages m
        WHERE m.notification_id = t.id
      ) lm ON TRUE
      ${whereSql}
    `;

    const countSql = `SELECT COUNT(*)::int AS n ${baseSql}`;

    const rowsSql = `
      SELECT
        t.id,
        t.query_type AS "queryType",
        t.subject,
        t.client_id AS "clientId",
        c.client_name AS "clientName",
        t.branch_id AS "branchId",
        b.branchname AS "branchName",
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
    const data = await this.dataSource.query(rowsSql, [
      ...params,
      paging.limit,
      paging.skip,
    ]);
    return { total, data };
  }

  async listTicketsForUser(user: ReqUser, q: NotificationsListQuery) {
    const { page, limit, skip } = this.normalizePaging(q);
    const status = q?.status;
    const unreadOnly = Number(q?.unreadOnly ?? 0) === 1;

    const params: unknown[] = [];
    const wheres: string[] = [];

    // Scope:
    // - ADMIN/CEO/CCO: all
    // - others: where assigned or created
    if (['ADMIN', 'CEO', 'CCO'].includes(String(user.roleCode))) {
      // no user filter known
    } else {
      params.push(user.id);
      wheres.push(`(t.assigned_to_user_id = $1 OR t.created_by_user_id = $1)`);
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
    const { total, data } = await this.listThreadsRaw(whereSql, params, {
      skip,
      limit,
    });
    return { page, limit, total, data };
  }

  async listTicketsCreatedBy(user: ReqUser, q: NotificationsListQuery) {
    const { page, limit, skip } = this.normalizePaging(q);
    const status = q?.status;
    const unreadOnly = Number(q?.unreadOnly ?? 0) === 1;

    const params: unknown[] = [user.id];
    const wheres: string[] = [`t.created_by_user_id = $1`];

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
    const { total, data } = await this.listThreadsRaw(whereSql, params, {
      skip,
      limit,
    });
    return { page, limit, total, data };
  }

  async getThreadDetailForUser(user: ReqUser, threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread))
      throw new BadRequestException('Access denied');

    const messages = await this.dataSource.query(
      `
      SELECT
        m.id,
        m.notification_id AS "notificationId",
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
        WHERE m.notification_id = $1
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
        subject: thread.subject,
      },
      messages,
    };
  }

  async replyAsUser(
    user: ReqUser,
    threadId: string,
    dto: ReplyNotificationDto,
  ) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread))
      throw new BadRequestException('Access denied');

    await this.dataSource.transaction(async (manager) => {
      const msg = manager.create(NotificationMessageEntity, {
        notificationId: threadId,
        senderUserId: user.id,
        message: dto.message,
        attachmentPath: dto.attachmentPath ?? null,
      });
      await manager.save(NotificationMessageEntity, msg);

      thread.status = 'OPEN';
      thread.updatedAt = new Date();
      await manager.save(NotificationEntity, thread);

      const existingRead = await manager.findOne(NotificationReadEntity, {
        where: { notificationId: threadId, userId: user.id },
      });
      if (existingRead) {
        existingRead.lastReadAt = new Date();
        await manager.save(NotificationReadEntity, existingRead);
      } else {
        await manager.save(NotificationReadEntity, {
          notificationId: threadId,
          userId: user.id,
          lastReadAt: new Date(),
        });
      }
    });

    return { ok: true };
  }

  async closeThread(user: ReqUser, threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread))
      throw new BadRequestException('Access denied');
    thread.status = 'CLOSED';
    thread.updatedAt = new Date();
    await this.threadsRepo.save(thread);
    return { status: 'CLOSED' };
  }

  async reopenThread(user: ReqUser, threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    if (!this.canAccessThread(user, thread))
      throw new BadRequestException('Access denied');
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
    const params: unknown[] = [];
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
      wheres.push(`t.assigned_to_user_id = $${params.length}`);
    }
    if (q.unreadOnly === 1) {
      params.push(adminUserId);
      wheres.push(
        `NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = t.id AND r.user_id = $${params.length})`,
      );
    }

    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const { total, data } = await this.listThreadsRaw(whereSql, params, {
      skip,
      limit,
    });

    return { page, limit, total, data, rows: data };
  }

  async getTicketDetailForAdmin(threadId: string) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    const messages = await this.messagesRepo.find({
      where: { notificationId: threadId },
      order: { createdAt: 'ASC' },
    });
    return { ticket: thread, messages };
  }

  async replyAsAdmin(
    adminUserId: string,
    _adminRole: string,
    threadId: string,
    dto: ReplyNotificationDto,
  ) {
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    await this.dataSource.transaction(async (manager) => {
      const msg = manager.create(NotificationMessageEntity, {
        notificationId: threadId,
        senderUserId: adminUserId,
        message: dto.message,
        attachmentPath: dto.attachmentPath ?? null,
      });
      await manager.save(NotificationMessageEntity, msg);
      thread.status = 'OPEN';
      thread.updatedAt = new Date();
      await manager.save(NotificationEntity, thread);
      const existingRead = await manager.findOne(NotificationReadEntity, {
        where: { notificationId: threadId, userId: adminUserId },
      });
      if (existingRead) {
        existingRead.lastReadAt = new Date();
        await manager.save(NotificationReadEntity, existingRead);
      } else {
        await manager.save(NotificationReadEntity, {
          notificationId: threadId,
          userId: adminUserId,
          lastReadAt: new Date(),
        });
      }
    });
    return { ok: true };
  }

  async markRead(threadId: string, userId: string) {
    const existing = await this.readsRepo.findOne({
      where: { notificationId: threadId, userId },
    });
    if (existing) {
      existing.lastReadAt = new Date();
      await this.readsRepo.save(existing);
      return { ok: true };
    }
    await this.readsRepo.save({
      notificationId: threadId,
      userId,
      lastReadAt: new Date(),
    });
    return { ok: true };
  }

  async setStatus(threadId: string, status: string) {
    const allowed = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (!allowed.includes(status))
      throw new BadRequestException('Invalid status');
    const thread = await this.threadsRepo.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Notification not found');
    thread.status = status;
    thread.updatedAt = new Date();
    await this.threadsRepo.save(thread);
    return { ok: true };
  }

  // -------------------------
  // Simple Notification System (Direct Routing)
  // Alternative to thread-based system above
  // -------------------------

  /**
   * Find admin recipient for TECHNICAL queries
   * @returns Admin user ID and role
   */
  private async findAdminRecipient(): Promise<{
    userId: string;
    role: string;
  }> {
    const rows = await this.dataSource.query(
      `SELECT u.id, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'ADMIN' AND u.is_active = TRUE AND u.deleted_at IS NULL ORDER BY u.created_at ASC LIMIT 1`,
      [],
    );
    if (!rows?.length)
      throw new NotFoundException(
        'No active ADMIN found for technical queries.',
      );
    return { userId: rows[0].id, role: rows[0].role };
  }

  /**
   * Find assigned CRM or AUDITOR for a client
   * @param clientId - Client UUID
   * @param assignmentType - 'CRM' or 'AUDITOR'
   * @returns User ID and role if found, null otherwise
   */
  private async findAssignedUser(
    clientId: string,
    assignmentType: 'CRM' | 'AUDITOR',
  ) {
    const rows = await this.dataSource.query(
      `
      SELECT ca.assigned_to_user_id AS user_id, r.code AS role
      FROM client_assignments_current ca
      JOIN users u ON u.id = ca.assigned_to_user_id
      JOIN roles r ON r.id = u.role_id
      WHERE ca.client_id = $1
        AND ca.assignment_type = $2
        AND u.is_active = TRUE
      LIMIT 1
      `,
      [clientId, assignmentType],
    );

    if (!rows?.length) return null;
    return { userId: rows[0].user_id, role: rows[0].role };
  }

  /**
   * Raise a notification with automatic recipient routing
   *
   * Routing rules:
   * - TECHNICAL → ADMIN
   * - COMPLIANCE → CRM (fallback: ADMIN)
   * - AUDIT → AUDITOR (fallback: ADMIN)
   *
   * @param fromUser - User raising the notification (from req.user)
   * @param dto - Notification details
   * @returns Status, notification ID, and routed recipient info
   */
  async raise(fromUser: UserCtx, dto: RaiseNotificationDto) {
    // Validation for types that require clientId
    if (
      (dto.queryType === 'COMPLIANCE' || dto.queryType === 'AUDIT') &&
      !dto.clientId
    ) {
      throw new BadRequestException(
        'clientId is required for COMPLIANCE and AUDIT queries.',
      );
    }

    let recipient: { userId: string; role: string } | null = null;

    // Routing logic
    if (dto.queryType === 'TECHNICAL') {
      recipient = await this.findAdminRecipient();
    } else if (dto.queryType === 'COMPLIANCE') {
      recipient = await this.findAssignedUser(dto.clientId!, 'CRM');
      if (!recipient) {
        // fallback to admin if CRM missing
        recipient = await this.findAdminRecipient();
      }
    } else if (dto.queryType === 'AUDIT') {
      recipient = await this.findAssignedUser(dto.clientId!, 'AUDITOR');
      if (!recipient) {
        // fallback to admin if auditor missing
        recipient = await this.findAdminRecipient();
      }
    }

    if (!recipient)
      throw new NotFoundException('No recipient could be determined.');

    const repo = this.dataSource.getRepository(NotificationEntity);

    const saved = await repo.save(
      repo.create({
        createdByUserId: fromUser.id,
        createdByRole: fromUser.role,
        assignedToUserId: recipient.userId,
        assignedToRole: recipient.role,
        clientId: dto.clientId ?? null,
        branchId: dto.branchId ?? null,
        queryType: dto.queryType,
        subject: dto.subject,
        status: 'OPEN',
        priority: 2,
        isArchived: false,
      }),
    );

    return {
      status: 'SENT',
      notificationId: saved.id,
      routedToRole: recipient.role,
      routedToUserId: recipient.userId,
    };
  }

  /**
   * Reply to an existing notification
   * Creates a new notification row that goes back to the original sender
   * Marks parent as READ
   *
   * @param fromUser - User replying (from req.user)
   * @param parentNotificationId - Parent notification UUID
   * @param message - Reply message
   * @returns Status and new notification ID
   */
  async reply(
    fromUser: UserCtx,
    parentNotificationId: string,
    message: string,
  ) {
    const repo = this.dataSource.getRepository(NotificationEntity);

    const parent = await repo.findOne({ where: { id: parentNotificationId } });
    if (!parent) throw new NotFoundException('Parent notification not found.');

    // reply goes back to original sender
    const saved = await repo.save(
      repo.create({
        createdByUserId: fromUser.id,
        createdByRole: fromUser.role,
        assignedToUserId: parent.createdByUserId,
        assignedToRole: parent.createdByRole,
        clientId: parent.clientId,
        branchId: parent.branchId,
        queryType: parent.queryType,
        subject: `Re: ${parent.subject}`,
        status: 'OPEN',
        priority: parent.priority,
        isArchived: false,
      }),
    );

    // mark parent as READ (optional)
    if (parent.status === 'OPEN') {
      parent.readAt = new Date();
      await repo.save(parent);
    }

    return { status: 'SENT', notificationId: saved.id };
  }

  /* ─── System Notifications (cron / auto-generated) ─── */

  /**
   * Create a system notification with dedup via source_key.
   * Returns existing record if already created (idempotent).
   */
  async createSystemNotification(input: {
    clientId: string;
    sourceKey: string;
    subject: string;
    message: string;
    branchId?: string;
    queryType?: string;
    priority?: number;
  }): Promise<NotificationEntity> {
    // Dedup: if source_key already exists for this client, skip
    const existing = await this.threadsRepo.findOne({
      where: { clientId: input.clientId, sourceKey: input.sourceKey },
    });
    if (existing) return existing;

    const adminUserId = await this.findAnyAdminUserId();

    return this.dataSource.transaction(async (manager) => {
      const thread = manager.create(NotificationEntity, {
        subject: input.subject,
        queryType: input.queryType || 'COMPLIANCE',
        priority: input.priority ?? 1, // 1 = high
        status: 'OPEN',
        createdByUserId: adminUserId,
        createdByRole: 'SYSTEM',
        clientId: input.clientId,
        branchId: input.branchId ?? null,
        assignedToUserId: adminUserId,
        assignedToRole: 'ADMIN',
        sourceKey: input.sourceKey,
      });
      const saved = await manager.save(NotificationEntity, thread);

      const msg = manager.create(NotificationMessageEntity, {
        notificationId: saved.id,
        senderUserId: adminUserId,
        message: input.message,
        attachmentPath: null,
      });
      await manager.save(NotificationMessageEntity, msg);

      return saved;
    });
  }
}
