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
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from '../assignments/entities/client-assignment-history.entity';
import { calcRotationDueOn } from './helpers/rotation';

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
  async notify(adminUser: { id: string; role: string }, dto: AdminNotifyDto) {
    if (adminUser.role !== 'ADMIN') {
      throw new BadRequestException(
        'Only ADMIN can send admin action notifications.',
      );
    }

    const repo = this.dataSource.getRepository(NotificationEntity);

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
    return { status: 'SENT', notificationId: saved.id };
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

      // Record history for outgoing assignment (if exists)
      if (current) {
        await histRepo.save(
          histRepo.create({
            clientId: dto.clientId,
            assignmentType: dto.assignmentType,
            assignedToUserId: current.assignedToUserId,
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
      } catch (e: any) {
        throw new ConflictException(
          'Active assignment already exists. Please retry.',
        );
      }

      // Optional notifications
      if (dto.notifyParties) {
        const subject = `${dto.assignmentType} Assignment Updated`;
        const msg = `Assignment updated for client. Effective: ${effectiveDate}. Next rotation due: ${rotationDueOn}. Reason: ${dto.reason}`;

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
        if (current?.assignedToUserId) {
          await notifRepo.save(
            notifRepo.create({
              createdByUserId: adminUser.id,
              createdByRole: 'ADMIN',
              assignedToUserId: current.assignedToUserId,
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
