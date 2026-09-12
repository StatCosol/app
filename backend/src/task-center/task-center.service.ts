import { WorkQueryDto } from './work-query.dto';
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
    const { sql, values } = this.itemsQuery(params);
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
  private itemsQuery(params: Parameters<TaskCenterService['getMyItems']>[0]) {
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

    return { sql, values };
  }

  async getWorkspace(
    scope: Parameters<TaskCenterService['getMyItems']>[0],
    q: WorkQueryDto,
  ) {
    const source = this.itemsQuery(scope);
    const values = [...source.values];
    const bind = (value: unknown) => {
      values.push(value);
      return '$' + values.length;
    };
    const today = bind(operationalDate());
    const filters: string[] = ['TRUE'];
    if (q.clientId) filters.push('client_id = ' + bind(q.clientId) + '::uuid');
    if (q.branchId) filters.push('branch_id = ' + bind(q.branchId) + '::uuid');
    if (q.month) filters.push('LEFT(due_date,7) = ' + bind(q.month));
    if (q.module) filters.push('module = ' + bind(q.module));
    if (q.q?.trim())
      filters.push(
        'POSITION(LOWER(' + bind(q.q.trim()) + ') IN LOWER(title)) > 0',
      );
    const views: Record<string, string> = {
      active: 'active',
      overdue: 'overdue',
      soon: 'soon',
      returned: "active AND status = 'AWAITING_REUPLOAD'",
      closed: "status = 'CLOSED'",
      all: 'TRUE',
    };
    const view = views[q.view || 'active'];
    if (!view) throw new BadRequestException('Invalid work view');
    const requestedPage = Number(q.page ?? 1),
      pageSize = Number(q.limit ?? 25);
    if (
      !Number.isInteger(requestedPage) ||
      requestedPage < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 200
    )
      throw new BadRequestException('Invalid page or page size');
    const limit = bind(pageSize),
      page = bind(requestedPage);
    const sql = `WITH scoped AS (${source.sql}),
    named AS (SELECT t.*, c.client_name AS company_name, b.branchname AS branch_name,
      t.status NOT IN ('CLOSED','CANCELLED') AS active,
      t.status NOT IN ('CLOSED','CANCELLED') AND t.due_date < ${today} AS overdue,
      t.status NOT IN ('CLOSED','CANCELLED') AND t.due_date BETWEEN ${today} AND (${today}::date + 7)::text AS soon
      FROM scoped t LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN client_branches b ON b.id=t.branch_id),
    filtered AS (SELECT * FROM named WHERE ${filters.join(' AND ')}),
    selected AS (SELECT * FROM filtered WHERE ${view}),
    bounds AS (SELECT COUNT(*)::int AS total, LEAST(${page}::int,GREATEST(1,CEIL(COUNT(*)::numeric/${limit}::int)::int)) AS page FROM selected),
    paged AS (SELECT * FROM selected ORDER BY overdue DESC NULLS LAST,
      CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
      due_date ASC NULLS LAST,id ASC LIMIT ${limit} OFFSET ((SELECT page FROM bounds)-1)*${limit}::int)
    SELECT (SELECT row_to_json(bounds) FROM bounds) AS pagination,
      (SELECT json_build_object('all',COUNT(*),'active',COUNT(*) FILTER(WHERE active),'overdue',COUNT(*) FILTER(WHERE overdue),
       'soon',COUNT(*) FILTER(WHERE soon),'returned',COUNT(*) FILTER(WHERE active AND status='AWAITING_REUPLOAD'),'closed',COUNT(*) FILTER(WHERE status='CLOSED')) FROM filtered) AS summary,
      COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS items,
      COALESCE((SELECT json_agg(x ORDER BY x.name) FROM (SELECT DISTINCT client_id AS id,company_name AS name FROM named WHERE client_id IS NOT NULL) x),'[]'::json) AS companies,
      COALESCE((SELECT json_agg(x ORDER BY x.name) FROM (SELECT DISTINCT branch_id AS id,branch_name AS name,client_id AS "clientId" FROM named WHERE branch_id IS NOT NULL) x),'[]'::json) AS branches,
      COALESCE((SELECT json_agg(x.module ORDER BY x.module) FROM (SELECT DISTINCT module FROM named) x),'[]'::json) AS modules`;
    const [result] = await this.dataSource.query(sql, values);
    return {
      ...result,
      limit: pageSize,
      asOf: operationalDate(),
      generatedAt: new Date().toISOString(),
    };
  }
}
