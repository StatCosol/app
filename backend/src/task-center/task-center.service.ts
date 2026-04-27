import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    contractorId?: string | null;
  }) {
    const rows = await this.getMyItems(params);

    const total = rows.length;
    const open = rows.filter((x) => x.status === 'OPEN').length;
    const inProgress = rows.filter((x) => x.status === 'IN_PROGRESS').length;
    const overdue = rows.filter((x) => {
      if (!x.due_date) return false;
      return (
        new Date(x.due_date).getTime() < Date.now() && x.status !== 'CLOSED'
      );
    }).length;
    const closed = rows.filter((x) => x.status === 'CLOSED').length;

    return {
      total,
      open,
      inProgress,
      overdue,
      closed,
    };
  }

  async getMyItems(params: {
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    contractorId?: string | null;
    status?: string | null;
  }) {
    const where: string[] = ['t.assigned_role = $1'];
    const values: unknown[] = [params.role];
    let idx = 2;

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

    if (params.branchId) {
      where.push(`t.branch_id = $${idx}`);
      values.push(params.branchId);
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
        t.due_date,
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
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    contractorId?: string | null;
  }) {
    const rows = await this.getMyItems(params);
    return rows.filter((x) => {
      if (!x.due_date) return false;
      return (
        new Date(x.due_date).getTime() < Date.now() && x.status !== 'CLOSED'
      );
    });
  }

  async getExpiringItems(params: {
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR';
    userId?: string | null;
    clientId?: string | null;
    branchId?: string | null;
    contractorId?: string | null;
    withinDays?: number;
  }) {
    const withinDays = params.withinDays ?? 7;
    const rows = await this.getMyItems(params);
    const future = Date.now() + withinDays * 24 * 60 * 60 * 1000;

    return rows.filter((x) => {
      if (!x.due_date) return false;
      const ts = new Date(x.due_date).getTime();
      return ts >= Date.now() && ts <= future && x.status !== 'CLOSED';
    });
  }
}
