import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TaskEngineService } from '../services/task-engine.service';
import { AutomationNotificationService } from '../services/automation-notification.service';
import { DataSource } from 'typeorm';

@Injectable()
export class DueRemindersJob {
  private readonly logger = new Logger(DueRemindersJob.name);

  constructor(
    private readonly taskEngine: TaskEngineService,
    private readonly automationNotification: AutomationNotificationService,
    private readonly dataSource: DataSource,
  ) {}

  /** Daily at 08:00 — send task + audit due reminders, escalate overdue. */
  @Cron('0 0 8 * * *')
  async handle() {
    this.logger.log('Starting due reminders job');
    try {
      /* ── 1. Tasks due within 3 days ──────────────────────────── */
      const dueSoon = await this.taskEngine.getTasksDueSoon(3);
      let remindersSent = 0;

      for (const task of dueSoon) {
        try {
          await this.automationNotification.sendTaskDueReminder({
            id: task.id,
            title: task.title,
            dueDate: task.due_date,
            assignedUserId: task.assigned_user_id,
            assignedRole: task.assigned_role,
            clientId: task.client_id,
            branchId: task.branch_id,
          });
          remindersSent++;
        } catch {
          // continue on individual failures
        }
      }

      /* ── 2. Overdue tasks — escalate to CRM ─────────────────── */
      const overdue = await this.taskEngine.getOverdueTasks();
      let escalated = 0;

      for (const task of overdue) {
        try {
          await this.automationNotification.sendOverdueEscalation({
            id: task.id,
            title: task.title,
            dueDate: task.due_date,
            assignedUserId: task.assigned_user_id,
            assignedRole: task.assigned_role,
            clientId: task.client_id,
            branchId: task.branch_id,
          });
          escalated++;
        } catch {
          // continue
        }
      }

      /* ── 3. Audit schedules due within 5 days ───────────────── */
      let auditReminders = 0;
      try {
        const schedules = await this.dataSource.query(
          `SELECT s.id, s.audit_type, s.auditor_user_id,
                  s.due_date, s.schedule_date,
                  c.client_name, s.client_id
           FROM audit_schedules s
           JOIN clients c ON c.id = s.client_id
           WHERE s.status = 'SCHEDULED'
             AND s.due_date >= CURRENT_DATE
             AND s.due_date <= CURRENT_DATE + INTERVAL '5 days'`,
        );

        for (const sch of schedules) {
          if (!sch.auditor_user_id) continue;
          try {
            await this.automationNotification.sendScheduleNotice({
              auditorUserId: sch.auditor_user_id,
              clientName: sch.client_name,
              auditType: sch.audit_type,
              scheduleDate: new Date(sch.schedule_date).toDateString(),
              dueDate: sch.due_date
                ? new Date(sch.due_date).toDateString()
                : null,
              clientId: sch.client_id,
            });
            auditReminders++;
          } catch {
            // continue
          }
        }
      } catch (err) {
        this.logger.warn(`Audit schedule reminder sub-step failed: ${err}`);
      }

      this.logger.log(
        `Due reminders: ${remindersSent} task, ${escalated} overdue escalated, ${auditReminders} audit schedule`,
      );
    } catch (err) {
      this.logger.error(
        `Due reminders job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
