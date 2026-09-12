import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { operationalDate, addCalendarDays } from '../common/operational-date';
const active = (row: TaskRow) => !['CLOSED', 'CANCELLED'].includes(row.status);
const due = (row: TaskRow) =>
  row.due_date ? String(row.due_date).slice(0, 10) : null;

export interface TaskRow {
  id: string;
  module: string;
  title: string;
  description: string | null;
  reference_id: string | null;
  reference_type: string | null;
  priority: string;
  assigned_role: string;
  assigned_user_id: string | null;
  client_id: string | null;
  branch_id: string | null;
  contractor_id: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

@Injectable()
export class TaskCenterService {
  constructor(private readonly dataSource: DataSource) {}

  async getMySummary(params: {
    role:
      | 'ADMIN'
      | 'CCO'
      | 'PAYROLL'
      | 'CRM'
      | 'AUDITOR'
      | 'CLIENT'
      | 'BRANCH'
      | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    branchIds?: string[];
    clientIds?: string[];
    assignedRoles?: string[];
    taskModules?: string[];
    contractorId?: string | null;
  }) {
    const rows = await this.getMyItems(params);

    const total = rows.length;
    const open = rows.filter((x) => x.status === 'OPEN').length;
    const inProgress = rows.filter((x) => x.status === 'IN_PROGRESS').length;
    const today = operationalDate();
    const overdue = rows.filter(
      (x) => active(x) && due(x) && due(x)! < today,
    ).length;
    const dueSoon = rows.filter(
      (x) =>
        active(x) &&
        due(x) &&
        due(x)! >= today &&
        due(x)! <= addCalendarDays(today, 7),
    ).length;
    const closed = rows.filter((x) => x.status === 'CLOSED').length;

    return {
      total,
      open,
      inProgress,
      overdue,
      dueSoon,
      closed,
    };
  }

  async getMyItems(params: {
    role:
      | 'ADMIN'
      | 'CCO'
      | 'PAYROLL'
      | 'CRM'
      | 'AUDITOR'
      | 'CLIENT'
      | 'BRANCH'
      | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    branchIds?: string[];
    clientIds?: string[];
    assignedRoles?: string[];
    taskModules?: string[];
    contractorId?: string | null;
    status?: string | null;
  }) {
    const where: string[] = [
      params.assignedRoles !== undefined
        ? 't.assigned_role = ANY($1::text[])'
        : 't.assigned_role = $1',
    ];
    const values: unknown[] = [params.assignedRoles ?? params.role];
    let idx = 2;

    if (params.taskModules !== undefined) {
      where.push(`t.module = ANY($${idx}::text[])`);
      values.push(params.taskModules);
      idx += 1;
    }
    if (params.userId) {
      where.push(
        `(t.assigned_user_id = $${idx} OR t.assigned_user_id IS NULL)`,
      );
      values.push(params.userId);
      idx += 1;
    }

    if (params.clientId) {
      where.push(`t.client_id = $${idx}`);
      values.push(params.clientId);
      idx += 1;
    }

    if (params.clientIds !== undefined) {
      where.push(`t.client_id = ANY($${idx}::uuid[])`);
      values.push(params.clientIds);
      idx += 1;
    }

    if (params.branchId) {
      where.push(`t.branch_id = $${idx}`);
      values.push(params.branchId);
      idx += 1;
    } else if (params.branchIds !== undefined) {
      where.push(`t.branch_id = ANY($${idx}::uuid[])`);
      values.push(params.branchIds);
      idx += 1;
    }

    if (params.contractorId) {
      where.push(`t.contractor_id = $${idx}`);
      values.push(params.contractorId);
      idx += 1;
    }

    if (params.status) {
      where.push(`t.status = $${idx}`);
      values.push(params.status);
      idx += 1;
    }

    const sql = `
      SELECT
        t.id,
        t.module,
        t.title,
        t.description,
        t.reference_id,
        t.reference_type,
        t.priority,
        t.assigned_role,
        t.assigned_user_id,
        t.client_id,
        t.branch_id,
        t.contractor_id,
        t.due_date::text AS due_date,
        t.status,
        t.created_at
      FROM system_tasks t
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE t.priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
    `;

    return this.dataSource.query(sql, values);
  }

  async getOverdueItems(params: {
    role:
      | 'ADMIN'
      | 'CCO'
      | 'PAYROLL'
      | 'CRM'
      | 'AUDITOR'
      | 'CLIENT'
      | 'BRANCH'
      | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    branchIds?: string[];
    clientIds?: string[];
    assignedRoles?: string[];
    taskModules?: string[];
    contractorId?: string | null;
  }) {
    const rows = await this.getMyItems(params);
    const today = operationalDate();
    return rows.filter((x) => active(x) && due(x) && due(x)! < today);
  }

  async getExpiringItems(params: {
    role:
      | 'ADMIN'
      | 'CCO'
      | 'PAYROLL'
      | 'CRM'
      | 'AUDITOR'
      | 'CLIENT'
      | 'BRANCH'
      | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    branchIds?: string[];
    clientIds?: string[];
    assignedRoles?: string[];
    taskModules?: string[];
    contractorId?: string | null;
    withinDays?: number;
  }) {
    const withinDays = params.withinDays ?? 7;
    const rows = await this.getMyItems(params);
    if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > 365)
      throw new BadRequestException('withinDays must be between 0 and 365');
    const today = operationalDate();
    const future = addCalendarDays(today, withinDays);
    return rows.filter(
      (x) => active(x) && due(x) && due(x)! >= today && due(x)! <= future,
    );
  }
}
