import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RoleEntity } from '../users/entities/role.entity';
import { AssignmentsService } from '../assignments/assignments.service';

type RoleCode = 'CRM' | 'AUDITOR';

@Injectable()
export class AssignmentsRotationService {
  private readonly log = new Logger(AssignmentsRotationService.name);

  private readonly CRM_DAYS = 365; // ~1 year
  private readonly AUDITOR_DAYS = 120; // ~4 months

  constructor(
    @InjectRepository(ClientAssignmentCurrentEntity)
    private currentRepo: Repository<ClientAssignmentCurrentEntity>,
    @InjectRepository(UserEntity) private users: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private roles: Repository<RoleEntity>,
    private readonly assignments: AssignmentsService,
  ) {}

  // Run daily at 02:10 AM server time
  @Cron('10 2 * * *')
  async rotateDaily(): Promise<void> {
    this.log.log('Rotation job started');
    const rows = await this.currentRepo.find();
    for (const assignment of rows) {
      await this.rotateIfDue(assignment);
    }

    this.log.log('Rotation job finished');
  }

  async rotateIfDue(assignment: ClientAssignmentCurrentEntity): Promise<void> {
    const today = this.toDateOnly(new Date());

    const expired = this.isExpired(
      assignment.startDate,
      assignment.assignmentType === 'CRM' ? this.CRM_DAYS : this.AUDITOR_DAYS,
      today,
    );
    const missing = !assignment.assignedToUserId;

    if (expired || missing) {
      await this.rotateOne(
        assignment.clientId,
        assignment.assignmentType,
        assignment.assignedToUserId ?? null,
        assignment.startDate,
        assignment.assignmentType === 'CRM'
          ? 'AUTO_ROTATION_CRM_YEARLY'
          : 'AUTO_ROTATION_AUDITOR_4MONTHS',
      );
    }
  }

  private async rotateOne(
    clientId: string,
    type: RoleCode,
    currentUserId: string | null,
    prevFrom: Date | null,
    reason: string,
  ) {
    const today = this.toDateOnly(new Date());

    const pool = await this.getActiveUsersByRole(type);
    if (pool.length === 0) {
      this.log.warn(`No active ${type} users available for client ${clientId}`);
      return;
    }

    const nextUserId = this.pickNextRoundRobin(
      pool.map((u) => u.id),
      currentUserId,
    );

    const finalUserId = nextUserId ?? currentUserId ?? pool[0].id;

    await this.assignments.changeAssignment({
      clientId,
      assignmentType: type,
      assignedToUserId: finalUserId,
      actorUserId: null,
      actorRole: 'SYSTEM',
      changeReason: reason,
    });

    this.log.log(
      `Rotated ${type} for client ${clientId}: ${currentUserId} -> ${finalUserId}`,
    );
  }

  private async getActiveUsersByRole(
    roleCode: RoleCode,
  ): Promise<UserEntity[]> {
    const role = await this.roles.findOne({ where: { code: roleCode } });
    if (!role) {
      this.log.warn(`Role not found for code ${roleCode}`);
      return [];
    }

    return this.users.find({
      where: { roleId: role.id, isActive: true },
      order: { createdAt: 'ASC' },
      select: ['id', 'isActive'],
    });
  }

  private pickNextRoundRobin(
    userIds: string[],
    currentUserId: string | null,
  ): string | null {
    if (!userIds.length) return null;
    if (currentUserId == null) return userIds[0];

    const idx = userIds.indexOf(currentUserId);
    if (idx === -1) return userIds[0];
    if (userIds.length === 1) return userIds[0];
    return userIds[(idx + 1) % userIds.length];
  }

  private isExpired(
    startDate: Date | null | undefined,
    maxAgeDays: number,
    today: string,
  ): boolean {
    if (!startDate) return true;
    const start = new Date(startDate.getTime());
    const cutoff = new Date(start);
    cutoff.setUTCDate(cutoff.getUTCDate() + maxAgeDays);
    const todayDate = new Date(`${today}T00:00:00Z`);
    return todayDate >= cutoff;
  }

  private toDateOnly(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
