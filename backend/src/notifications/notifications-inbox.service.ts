import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationListQueryDto } from './dto/notification-list.dto';
import { NotificationStatusDto } from './dto/notification-status.dto';
import {
  NOTIFICATIONS_LIST_SQL,
  NOTIFICATION_DETAIL_SQL,
} from './sql/notifications.sql';

type UserCtx = { id: string; role: string };

function toInt(v: unknown, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  return Math.min(Math.max(n, min), max);
}

/**
 * Notifications Inbox Service
 *
 * Uses raw SQL for fast listing (inbox/outbox)
 * Uses TypeORM for safe status updates
 *
 * Access control:
 * - Users can only see notifications where they are sender or recipient
 * - Only recipients can change notification status
 */
@Injectable()
export class NotificationsInboxService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * List notifications for inbox or outbox
   *
   * @param user - User context (from req.user)
   * @param q - Query parameters (box, status, filters, pagination)
   * @returns Array of notifications with sender/recipient details
   */
  async list(user: UserCtx, q: NotificationListQueryDto) {
    const box = (q.box ?? 'INBOX').toUpperCase() as 'INBOX' | 'OUTBOX';
    const status = q.status ? q.status.toUpperCase() : null;
    const queryType = q.queryType ? q.queryType.toUpperCase() : null;

    const limit = toInt(q.limit, 200, 1, 500);
    const offset = toInt(q.offset, 0, 0, 100000);

    return this.dataSource.query(NOTIFICATIONS_LIST_SQL, [
      box,
      user.id,
      status,
      queryType,
      q.clientId ?? null,
      q.branchId ?? null,
      q.fromDate ?? null,
      q.toDate ?? null,
      q.search ?? null,
      limit,
      offset,
    ]);
  }

  /**
   * Get notification detail by ID
   *
   * @param user - User context (from req.user)
   * @param id - Notification UUID
   * @returns Notification with full details
   * @throws NotFoundException if notification not found
   * @throws ForbiddenException if user is not sender or recipient
   */
  async getById(user: UserCtx, id: string) {
    const rows = await this.dataSource.query(NOTIFICATION_DETAIL_SQL, [id]);
    const n = rows?.[0];
    if (!n) throw new NotFoundException('Notification not found.');

    // Access control: only sender or recipient can view
    if (n.created_by_user_id !== user.id && n.assigned_to_user_id !== user.id) {
      throw new ForbiddenException('Not allowed.');
    }
    return n;
  }

  /**
   * Update notification status (UNREAD → READ → CLOSED)
   *
   * @param user - User context (from req.user)
   * @param id - Notification UUID
   * @param dto - Status update DTO
   * @returns Success status
   * @throws NotFoundException if notification not found
   * @throws ForbiddenException if user is not the recipient
   */
  async setStatus(user: UserCtx, id: string, dto: NotificationStatusDto) {
    const repo = this.dataSource.getRepository(NotificationEntity);
    const n = await repo.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Notification not found.');

    // Only recipient can change status (best practice)
    if (n.assignedToUserId !== user.id) {
      throw new ForbiddenException('Only recipient can change status.');
    }

    n.status = dto.status;

    if (dto.status === 'READ' && !n.readAt) {
      n.readAt = new Date();
    }

    // If moved back to OPEN, clear readAt (optional)
    if (dto.status === 'OPEN') {
      n.readAt = null;
    }

    await repo.save(n);
    return { status: 'OK' };
  }
}
