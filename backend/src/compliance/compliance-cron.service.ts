import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class ComplianceCronService {
  private readonly logger = new Logger(ComplianceCronService.name);

  constructor(
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private toDateOnly(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  @Cron('0 30 1 * * *')
  async markOverdueAndNotify() {
    const today = this.toDateOnly(new Date());

    const due = await this.tasks
      .createQueryBuilder('t')
      .where('t.dueDate < :today', { today })
      .andWhere('t.status IN (:...st)', {
        st: ['PENDING', 'IN_PROGRESS', 'REJECTED'] as TaskStatus[],
      })
      .getMany();

    if (!due.length) {
      return;
    }

    await this.tasks
      .createQueryBuilder()
      .update()
      .set({ status: 'OVERDUE' as TaskStatus })
      .where('dueDate < :today', { today })
      .andWhere('status IN (:...st)', {
        st: ['PENDING', 'IN_PROGRESS', 'REJECTED'] as TaskStatus[],
      })
      .execute();

    for (const t of due) {
      // TODO: Implement notification ticket for CRM and contractor overdue tasks
      // Existing email logic remains
      const taskId = t.id;
      const clientId = t.clientId;
      const branchId = t.branchId;
      if (t.assignedByUserId) {
        const crm = await this.users.findOne({
          where: { id: t.assignedByUserId },
        });
        if (crm?.email) {
          await this.email.send(
            crm.email,
            `Task Overdue #${taskId}`,
            'Compliance Task Overdue',
            `Task #${taskId} is overdue as of ${today}. Please follow up with the contractor.`,
          );
        }
      }
      if (t.assignedToUserId) {
        const contractor = await this.users.findOne({
          where: { id: t.assignedToUserId },
        });
        if (contractor?.email) {
          await this.email.send(
            contractor.email,
            `Task Overdue #${taskId}`,
            'Compliance Task Overdue',
            `Task #${taskId} is overdue. Please upload evidence and submit immediately.`,
          );
        }
      }
    }

    this.logger.log(`Marked overdue + notified for ${due.length} tasks`);
  }

  @Cron('0 0 1 * * *')
  async sendSlaReminders() {
    const today = new Date();
    const todayStr = this.toDateOnly(today);

    const threeDaysAhead = new Date(today.getTime());
    threeDaysAhead.setUTCDate(threeDaysAhead.getUTCDate() + 3);
    const threeDaysAheadStr = this.toDateOnly(threeDaysAhead);

    const threeDaysAgo = new Date(today.getTime());
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    const threeDaysAgoStr = this.toDateOnly(threeDaysAgo);

    // 1) Three days before due date -> notify contractor
    const dueSoon = await this.tasks
      .createQueryBuilder('t')
      .where('t.dueDate = :dueSoon', { dueSoon: threeDaysAheadStr })
      .andWhere('t.status IN (:...st)', {
        st: ['PENDING', 'IN_PROGRESS'] as TaskStatus[],
      })
      .andWhere('t.lastNotifiedAt IS NULL')
      .getMany();

    for (const t of dueSoon) {
      if (!t.assignedToUserId) continue;
      // TODO: Implement notification ticket for due soon contractor
      await this.tasks.update({ id: t.id }, { lastNotifiedAt: new Date() });
    }

    // 2) On due date -> notify contractor + CRM
    const dueToday = await this.tasks
      .createQueryBuilder('t')
      .where('t.dueDate = :today', { today: todayStr })
      .andWhere('t.status IN (:...st)', {
        st: ['PENDING', 'IN_PROGRESS'] as TaskStatus[],
      })
      .getMany();

    for (const t of dueToday) {
      const clientId = t.clientId;
      const branchId = t.branchId;
      // TODO: Implement notification ticket for due today contractor and CRM
    }

    // 3) Three days overdue -> escalate to ADMIN
    // TODO: Implement admin escalation logic for overdue tasks
    // Existing email logic remains

    this.logger.log(
      `SLA reminders processed: ${dueSoon.length} due-soon, ${dueToday.length} due-today tasks`,
    );
  }
}
