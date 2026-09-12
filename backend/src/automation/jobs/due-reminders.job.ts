import { operationalDate } from '../../common/operational-date';
import { AutomationScope, scopedRows } from '../automation-scope';
import { Injectable, Logger } from '@nestjs/common';
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

  async getSchedules(scope: AutomationScope = {}) {
    return scopedRows(
      this.dataSource,
      `SELECT s.id, s.audit_type, s.auditor_id AS auditor_user_id,
                  s.due_date, s.schedule_date, s.branch_id,
                  c.client_name, s.client_id
           FROM audit_schedules s
           JOIN clients c ON c.id = s.client_id
           WHERE s.status = 'SCHEDULED'
             AND s.due_date >= $1::date
             AND s.due_date <= $1::date + $2::int
             AND c.is_deleted = false`,
      [operationalDate(), scope.options?.auditDays ?? 5],
      scope,
    );
  }

  /** Daily at 08:00 — send task + audit due reminders, escalate overdue. */
  async handle(scope: AutomationScope = {}) {
    this.logger.log('Starting due reminders job');
    let failures = 0;
    try {
      /* ── 1. Tasks due within 3 days ──────────────────────────── */
      const dueSoon = await this.taskEngine.getTasksDueSoon(
        scope.options?.taskDays ?? 3,
        scope,
      );
      let remindersSent = 0;

      for (const task of dueSoon) {
        try {
          if (
            await this.automationNotification.sendTaskDueReminder({
              id: task.id,
              title: task.title,
              dueDate: task.due_date,
              assignedUserId: task.assigned_user_id,
              assignedRole: task.assigned_role,
              clientId: task.client_id,
              branchId: task.branch_id,
            })
          )
            remindersSent++;
        } catch {
          failures++;
          // continue on individual failures
        }
      }

      /* ── 2. Overdue tasks — escalate to CRM ─────────────────── */
      const overdue = await this.taskEngine.getOverdueTasks(scope);
      let escalated = 0;

      for (const task of overdue) {
        try {
          if (
            await this.automationNotification.sendOverdueEscalation({
              id: task.id,
              title: task.title,
              dueDate: task.due_date,
              assignedUserId: task.assigned_user_id,
              assignedRole: task.assigned_role,
              clientId: task.client_id,
              branchId: task.branch_id,
              referenceId: task.reference_id,
              referenceType: task.reference_type,
            })
          )
            escalated++;
        } catch {
          failures++;
          // continue
        }
      }

      /* ── 3. Audit schedules due within 5 days ───────────────── */
      let auditReminders = 0;
      try {
        const schedules = await this.getSchedules(scope);

        for (const sch of schedules) {
          if (!sch.auditor_user_id) continue;
          try {
            if (
              await this.automationNotification.sendScheduleNotice({
                scheduleId: sch.id,
                auditorUserId: sch.auditor_user_id,
                clientName: sch.client_name,
                auditType: sch.audit_type,
                scheduleDate: new Date(sch.schedule_date).toDateString(),
                dueDate: sch.due_date
                  ? new Date(sch.due_date).toDateString()
                  : null,
                clientId: sch.client_id,
              })
            )
              auditReminders++;
          } catch {
            failures++;
            // continue
          }
        }
      } catch (err) {
        failures++;
        const errMsg = err instanceof Error ? err.message : 'unknown';
        this.logger.warn(`Audit schedule reminder sub-step failed: ${errMsg}`);
      }

      this.logger.log(
        `Due reminders: ${remindersSent} task, ${escalated} overdue escalated, ${auditReminders} audit schedule`,
      );
      return { remindersSent, escalated, auditReminders, failures };
    } catch (err) {
      this.logger.error(
        `Due reminders job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
