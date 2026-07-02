import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminNotifyDto } from './dto/admin-notify.dto';
import { AdminReassignDto } from './dto/admin-reassign.dto';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { NotificationMessageEntity } from '../notifications/entities/notification-message.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from '../assignments/entities/client-assignment-history.entity';
import { calcRotationDueOn } from './helpers/rotation';

const DENORM_ASSIGNMENT_COL: Record<string, string> = {
  CRM: 'assigned_crm_id',
  AUDITOR: 'assigned_auditor_id',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Admin Actions Service
 *
 * Provides transaction-safe operations for admin actions:
 * - notify: Send notifications to users
 * - reassign: Reassign/rotate CRM or Auditor assignments
 *
 * ⚠️ CRITICAL CONSTRAINTS:
 * - Unique active assignment enforced by DB index: ux_client_assignments_active
 * - Pessimistic write lock prevents race conditions
 * - Admin role required for all operations
 * - Transaction rollback on any error
 */
@Injectable()
export class AdminActionsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * ADMIN -> Notify (creates a notification row)
   *
   * @param adminUser - Admin user from JWT (req.user)
   * @param dto - Notification details
   * @returns Status and notification ID
   */
  async notify(
    adminUser: { id: string; role: string; roleCode?: string },
    dto: AdminNotifyDto,
  ) {
    if ((adminUser.roleCode || adminUser.role) !== 'ADMIN') {
      throw new BadRequestException(
        'Only ADMIN can send admin action notifications.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(NotificationEntity);
      const msgRepo = manager.getRepository(NotificationMessageEntity);

      const n = repo.create({
        createdByUserId: adminUser.id,
        createdByRole: 'ADMIN',
        assignedToUserId: dto.targetUserId,
        assignedToRole: dto.targetRole,
        clientId: dto.clientId ?? null,
        branchId: dto.branchId ?? null,
        queryType: dto.queryType ?? 'SYSTEM',
        subject: dto.subject,
        status: 'OPEN',
        priority: 2,
        isArchived: false,
      });

      const saved = await repo.save(n);

      // Persist the first message body so recipients see a populated thread
      // (matches the normal notification creation path in NotificationsService).
      await msgRepo.save(
        msgRepo.create({
          notificationId: saved.id,
          senderUserId: adminUser.id,
          message: dto.message,
          attachmentPath: null,
        }),
      );

      return { status: 'SENT', notificationId: saved.id };
    });
  }

  /**
   * ADMIN -> Reassign/Rotate CRM or Auditor for a client (transaction safe)
   *
   * Process:
   * 1. Lock current ACTIVE assignment (pessimistic_write)
   * 2. Validate oldUserId if provided
   * 3. Check if already assigned to same user (no-op)
   * 4. Inactivate existing assignment
   * 5. Create new ACTIVE assignment with calculated rotation_due_on
   * 6. Insert history record
   * 7. Send notifications if notifyParties=true
   *
   * ⚠️ Unique index prevents duplicate ACTIVE assignments
   *
   * @param adminUser - Admin user from JWT (req.user)
   * @param dto - Reassignment details
   * @returns Status, assignment ID, and rotation due date
   */
  async reassign(
    adminUser: { id: string; role: string },
    dto: AdminReassignDto,
  ) {
    if (adminUser.role !== 'ADMIN') {
      throw new BadRequestException('Only ADMIN can reassign.');
    }

    const effectiveDate = dto.effectiveDate ?? todayISO();
    const rotationDueOn = calcRotationDueOn(dto.assignmentType, effectiveDate);

    return this.dataSource.transaction(async (manager) => {
      // ---- Validate clientId exists ----
      const clientRows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM clients WHERE id = $1 LIMIT 1`,
        [dto.clientId],
      );
      if (!clientRows.length) {
        throw new NotFoundException(`Client ${dto.clientId} not found.`);
      }

      // ---- Validate newUserId has the matching role ----
      const expectedRole =
        dto.assignmentType === 'CRM'
          ? 'CRM'
          : dto.assignmentType === 'AUDITOR'
            ? 'AUDITOR'
            : null;
      if (!expectedRole) {
        throw new BadRequestException(
          `Unsupported assignmentType: ${dto.assignmentType}`,
        );
      }
      const userRows: Array<{ code: string | null }> = await manager.query(
        `SELECT r.code
           FROM users u
           LEFT JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1
          LIMIT 1`,
        [dto.newUserId],
      );
      if (!userRows.length) {
        throw new NotFoundException(`User ${dto.newUserId} not found.`);
      }
      if ((userRows[0].code ?? '').toUpperCase() !== expectedRole) {
        throw new BadRequestException(
          `User ${dto.newUserId} is not a ${expectedRole} user.`,
        );
      }

      const assignRepo = manager.getRepository(ClientAssignmentCurrentEntity);
      const histRepo = manager.getRepository(ClientAssignmentHistoryEntity);
      const notifRepo = manager.getRepository(NotificationEntity);

      // Find current assignment (lock row to avoid races)
      const current = await assignRepo
        .createQueryBuilder('ca')
        .setLock('pessimistic_write')
        .where('ca.clientId = :clientId', { clientId: dto.clientId })
        .andWhere('ca.assignmentType = :type', { type: dto.assignmentType })
        .getOne();

      // If oldUserId provided, validate it matches current
      if (
        dto.oldUserId &&
        current &&
        current.assignedToUserId !== dto.oldUserId
      ) {
        throw new ConflictException(
          'Current assignment user does not match oldUserId.',
        );
      }

      // If already assigned to same user, no-op
      if (current && current.assignedToUserId === dto.newUserId) {
        return {
          status: 'NO_CHANGE',
          message: `Client already assigned to this ${dto.assignmentType}.`,
          assignmentId: current.id,
          rotationNextDueOn: rotationDueOn,
        };
      }

      // Capture outgoing user id BEFORE mutating `current` below, so the
      // "notify old assignee" block still targets the previous user.
      const oldAssignedToUserId = current?.assignedToUserId ?? null;

      // Record history for outgoing assignment (if exists)
      if (current) {
        await histRepo.save(
          histRepo.create({
            clientId: dto.clientId,
            assignmentType: dto.assignmentType,
            assignedToUserId: oldAssignedToUserId!,
            startDate: current.startDate,
            endDate: new Date(effectiveDate),
            changedByUserId: adminUser.id,
            changeReason: dto.reason,
          }),
        );
      }

      // Upsert current assignment
      let savedAssign: ClientAssignmentCurrentEntity;
      try {
        if (current) {
          current.assignedToUserId = dto.newUserId;
          current.startDate = new Date(effectiveDate);
          savedAssign = await assignRepo.save(current);
        } else {
          savedAssign = await assignRepo.save(
            assignRepo.create({
              clientId: dto.clientId,
              assignmentType: dto.assignmentType,
              assignedToUserId: dto.newUserId,
              startDate: new Date(effectiveDate),
            }),
          );
        }
      } catch (e: unknown) {
        throw new ConflictException(
          'Active assignment already exists. Please retry.',
        );
      }

      // Sync the denormalised assigned_crm_id / assigned_auditor_id column on
      // clients so dashboard / CCO / CEO queries reading those columns reflect
      // the new assignment.
      const denormCol = DENORM_ASSIGNMENT_COL[dto.assignmentType];
      if (denormCol) {
        await manager.query(
          `UPDATE clients SET "${denormCol}" = $1 WHERE id = $2`,
          [dto.newUserId, dto.clientId],
        );
      }

      // Write-through to the legacy `client_assignments` table so the admin
      // dashboards/reports/readiness queries that still read from it stay in
      // sync with `client_assignments_current`. Uses ON CONFLICT on the
      // unique (client_id) index. crm_/auditor_assigned_from records the
      // role-specific rotation window for reports.
      const userCol =
        dto.assignmentType === 'CRM' ? 'crm_user_id' : 'auditor_user_id';
      const fromCol =
        dto.assignmentType === 'CRM'
          ? 'crm_assigned_from'
          : 'auditor_assigned_from';
      const toCol =
        dto.assignmentType === 'CRM'
          ? 'crm_assigned_to'
          : 'auditor_assigned_to';
      await manager.query(
        `INSERT INTO client_assignments
            (client_id, ${userCol}, start_date, ${fromCol}, ${toCol}, status, created_by)
          VALUES ($1, $2, $3::date, $3::date, NULL, 'ACTIVE', $4)
          ON CONFLICT (client_id) DO UPDATE
            SET ${userCol} = EXCLUDED.${userCol},
                ${fromCol} = EXCLUDED.${fromCol},
                ${toCol} = NULL,
                status = 'ACTIVE',
                end_date = NULL,
                updated_at = NOW()`,
        [dto.clientId, dto.newUserId, effectiveDate, adminUser.id],
      );

      // Optional notifications
      if (dto.notifyParties) {
        const subject = `${dto.assignmentType} Assignment Updated`;

        // Notify new assignee
        await notifRepo.save(
          notifRepo.create({
            createdByUserId: adminUser.id,
            createdByRole: 'ADMIN',
            assignedToUserId: dto.newUserId,
            assignedToRole: dto.assignmentType, // CRM or AUDITOR
            clientId: dto.clientId,
            branchId: null,
            queryType: 'SYSTEM',
            subject,
            status: 'OPEN',
            priority: 2,
            isArchived: false,
          }),
        );

        // Notify old assignee (if exists)
        if (oldAssignedToUserId && oldAssignedToUserId !== dto.newUserId) {
          await notifRepo.save(
            notifRepo.create({
              createdByUserId: adminUser.id,
              createdByRole: 'ADMIN',
              assignedToUserId: oldAssignedToUserId,
              assignedToRole: dto.assignmentType,
              clientId: dto.clientId,
              branchId: null,
              queryType: 'SYSTEM',
              subject,
              status: 'OPEN',
              priority: 2,
              isArchived: false,
            }),
          );
        }
      }

      return {
        status: 'UPDATED',
        assignmentId: savedAssign.id,
        rotationNextDueOn: rotationDueOn,
      };
    });
  }
}
