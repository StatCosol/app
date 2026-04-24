import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'AWAITING_REUPLOAD'
  | 'REUPLOADED'
  | 'CLOSED'
  | 'CANCELLED';

export type TaskModule =
  | 'AUDIT'
  | 'COMPLIANCE'
  | 'RETURNS'
  | 'RENEWAL'
  | 'SAFETY'
  | 'PAYROLL';

export interface CreateSystemTaskInput {
  module: TaskModule;
  title: string;
  description: string;
  referenceId: string;
  referenceType: string;
  priority?: TaskPriority;
  assignedRole:
    | 'CRM'
    | 'AUDITOR'
    | 'CLIENT'
    | 'BRANCH'
    | 'CONTRACTOR'
    | 'ADMIN';
  assignedUserId?: string | null;
  clientId?: string | null;
  branchId?: string | null;
  contractorId?: string | null;
  dueDate?: Date | null;
  createdByUserId?: string | null;
}

@Injectable()
export class TaskEngineService {
  private readonly logger = new Logger(TaskEngineService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createTask(input: CreateSystemTaskInput) {
    this.logger.log(
      `Creating task: ${input.module} | ${input.referenceType} | ${input.referenceId}`,
    );

    const rows = await this.dataSource.query(
      `
      INSERT INTO system_tasks
      (
        task_type,
        module,
        title,
        description,
        reference_id,
        reference_type,
        priority,
        assigned_role,
        assigned_user_id,
        client_id,
        branch_id,
        contractor_id,
        due_date,
        status,
        created_at,
        updated_at
      )
      VALUES
      ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'OPEN', NOW(), NOW())
      RETURNING *
      `,
      [
        input.module,
        input.title,
        input.description,
        input.referenceId,
        input.referenceType,
        input.priority ?? 'MEDIUM',
        input.assignedRole,
        input.assignedUserId ?? null,
        input.clientId ?? null,
        input.branchId ?? null,
        input.contractorId ?? null,
        input.dueDate ?? null,
      ],
    );

    return rows[0];
  }

  async createAuditNcTask(params: {
    auditId: string;
    ncId: string;
    assignedRole: 'BRANCH' | 'CONTRACTOR';
    assignedUserId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    contractorId?: string | null;
    dueDate?: Date | null;
    description: string;
  }) {
    return this.createTask({
      module: 'AUDIT',
      title: 'Correct non-complied audit document',
      description: params.description,
      referenceId: params.ncId,
      referenceType: 'AUDIT_NON_COMPLIANCE',
      priority: 'HIGH',
      assignedRole: params.assignedRole,
      assignedUserId: params.assignedUserId ?? null,
      clientId: params.clientId ?? null,
      branchId: params.branchId ?? null,
      contractorId: params.contractorId ?? null,
      dueDate: params.dueDate ?? null,
    });
  }

  async closeTasksByReference(referenceType: string, referenceId: string) {
    await this.dataSource.query(
      `
      UPDATE system_tasks
      SET status = 'CLOSED',
          updated_at = NOW()
      WHERE reference_type = $1
        AND reference_id = $2
        AND status <> 'CLOSED'
      `,
      [referenceType, referenceId],
    );

    return { success: true };
  }

  async getUserTaskSummary(
    userId: string,
    role: string,
  ): Promise<{
    open: number;
    overdue: number;
    dueSoon: number;
    total: number;
  }> {
    const now = new Date();
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const tasks = await this.dataSource.query(
      `
      SELECT id, due_date, status
      FROM system_tasks
      WHERE status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_REUPLOAD')
        AND (assigned_user_id = $1 OR (assigned_role = $2 AND assigned_user_id IS NULL))
      `,
      [userId, role],
    );

    let overdue = 0;
    let dueSoon = 0;
    for (const t of tasks) {
      if (t.due_date) {
        const d = new Date(t.due_date);
        if (d < now) overdue++;
        else if (d <= threeDaysOut) dueSoon++;
      }
    }

    return { open: tasks.length, overdue, dueSoon, total: tasks.length };
  }

  async getUserTasks(userId: string, role: string, limit = 50) {
    return this.dataSource.query(
      `
      SELECT *
      FROM system_tasks
      WHERE status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_REUPLOAD')
        AND (assigned_user_id = $1 OR (assigned_role = $2 AND assigned_user_id IS NULL))
      ORDER BY
        CASE priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        due_date ASC NULLS LAST,
        created_at DESC
      LIMIT $3
      `,
      [userId, role, limit],
    );
  }

  async getOverdueTasks() {
    return this.dataSource.query(
      `
      SELECT *
      FROM system_tasks
      WHERE status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_REUPLOAD')
        AND due_date < NOW()
      ORDER BY due_date ASC
      `,
    );
  }

  async getTasksDueSoon(days = 3) {
    return this.dataSource.query(
      `
      SELECT *
      FROM system_tasks
      WHERE status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_REUPLOAD')
        AND due_date >= NOW()
        AND due_date <= NOW() + $1 * interval '1 day'
      ORDER BY due_date ASC
      `,
      [days],
    );
  }

  async notifyTaskAssignee(params: {
    creatorUserId: string;
    creatorRole:
      | 'ADMIN'
      | 'CRM'
      | 'AUDITOR'
      | 'CLIENT'
      | 'CONTRACTOR'
      | 'CEO'
      | 'CCO';
    subject: string;
    message: string;
    queryType: 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL';
    clientId?: string | null;
    branchId?: string | null;
  }) {
    return this.notificationsService.createTicket(
      params.creatorUserId,
      params.creatorRole,
      {
        subject: params.subject,
        message: params.message,
        queryType: params.queryType,
        clientId: params.clientId ?? undefined,
        branchId: params.branchId ?? undefined,
      },
    );
  }
}
