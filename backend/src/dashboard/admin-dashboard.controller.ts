import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ADMIN_DASHBOARD_SUMMARY_SQL,
  ADMIN_ESCALATIONS_SQL,
  ADMIN_ASSIGNMENTS_ATTENTION_SQL,
} from '../admin/sql/admin-dashboard.sql';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminDashboardController {
  private readonly logger = new Logger(AdminDashboardController.name);
  constructor(private readonly dataSource: DataSource) {}

  // Frontend (DashboardService.admin()) calls GET /api/admin/dashboard.
  // Keep this as an alias of /summary so the shell can load without special-casing.
  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Base' })
  @Get()
  async base() {
    return this.summary();
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Available States' })
  @Get('states')
  async getAvailableStates() {
    try {
      // Get distinct state codes from branches table
      const states = await this.dataSource.query(`
        SELECT DISTINCT state_code FROM (
          SELECT CASE
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('KL','KERALA') THEN 'KL'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('HR','HARYANA') THEN 'HR'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('BR','BIHAR') THEN 'BR'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
            WHEN REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
            ELSE REPLACE(TRIM(BOTH FROM UPPER(statecode)), ' ', '')
          END AS state_code
          FROM client_branches
          WHERE statecode IS NOT NULL
            AND isactive = TRUE
            AND isdeleted = FALSE
        ) s
        WHERE state_code IS NOT NULL AND state_code <> ''
        ORDER BY state_code ASC
      `);

      // Return as simple array
      return states
        .map((s: any) => s.state_code)
        .filter((code: string | null) => code !== null);
    } catch (error) {
      this.logger.error('Error fetching states:', error);
      return []; // Return empty array on error
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Clients Minimal' })
  @Get('clients-minimal')
  async clientsMinimal() {
    return this.dataSource.query(
      `SELECT id, client_name AS name
       FROM clients
       WHERE is_deleted = false AND is_active = true
       ORDER BY client_name ASC`,
    );
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  async summary(
    @Query('clientId') clientId?: string,
    @Query('stateCode') stateCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    try {
      // Use SQL query with state filtering
      const [result] = await this.dataSource.query(
        ADMIN_DASHBOARD_SUMMARY_SQL,
        [
          clientId || null,
          stateCode || null,
          from ? new Date(from) : null,
          to ? new Date(to) : null,
          30, // windowDays for "due soon"
        ],
      );

      // Fetch escalations data
      const escalations = await this.getEscalations(
        clientId,
        stateCode,
        from,
        to,
      );

      // Fetch assignments attention data
      const assignmentsAttention = await this.getAssignmentsAttention(
        clientId,
        stateCode,
      );

      // Fetch system health metrics
      const systemHealth = await this.getSystemHealth();

      // Transform snake_case to camelCase for response, matching AdminDashboardSummaryDto
      return {
        clients: result?.clients_count ?? 0,
        branches: result?.branches_count ?? 0,
        slaHealth: {
          status: result?.sla_status ?? 'RED',
          scorePct: result?.sla_score_pct ?? 0,
        },
        overdueAudits: result?.overdue_audits_count ?? 0,
        dueSoon: result?.due_soon_audits_count ?? 0,
        unreadNotifications: result?.unread_notifications_count ?? 0,
        escalations: escalations,
        assignmentsAttention: assignmentsAttention,
        systemHealth: systemHealth,
      };
    } catch (error) {
      this.logger.error('Dashboard summary error:', error);
      // Fallback response matching AdminDashboardSummaryDto
      return {
        clients: 0,
        branches: 0,
        slaHealth: {
          status: 'RED',
          scorePct: 0,
        },
        overdueAudits: 0,
        dueSoon: 0,
        unreadNotifications: 0,
        escalations: [],
        assignmentsAttention: [],
        systemHealth: {
          inactiveUsers15d: 0,
          unassignedClients: 0,
          failedNotifications7d: 0,
          failedJobs24h: 0,
        },
      };
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Escalations' })
  @Get('escalations')
  async getEscalations(
    @Query('clientId') clientId?: string,
    @Query('stateCode') stateCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    try {
      return await this.dataSource.query(ADMIN_ESCALATIONS_SQL, [
        clientId || null,
        stateCode || null,
        from ? new Date(from) : null,
        to ? new Date(to) : null,
      ]);
    } catch (error) {
      this.logger.error('Error fetching escalations:', error);
      return [];
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Assignments Attention' })
  @Get('assignments-attention')
  async getAssignmentsAttention(
    @Query('clientId') clientId?: string,
    @Query('stateCode') stateCode?: string,
  ) {
    try {
      return await this.dataSource.query(ADMIN_ASSIGNMENTS_ATTENTION_SQL, [
        clientId || null,
        stateCode || null,
      ]);
    } catch (error) {
      this.logger.error('Error fetching assignments attention:', error);
      return [];
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Task Status' })
  @Get('task-status')
  async getTaskStatus(@Query('range') range?: string) {
    const days = this.getRangeDays(range ?? '30d');
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      // Count assignments by status
      const [completedRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM client_assignments
         WHERE status = 'INACTIVE' AND (updated_at IS NULL OR updated_at >= $1)`,
        [since],
      );
      const [pendingRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM client_assignments
         WHERE status = 'ACTIVE' AND (updated_at IS NULL OR updated_at >= $1)`,
        [since],
      );
      const [overdueRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM client_assignments
         WHERE status = 'ACTIVE'
           AND end_date IS NOT NULL AND end_date < CURRENT_DATE
           AND (updated_at IS NULL OR updated_at >= $1)`,
        [since],
      );

      return {
        completed: completedRow?.n ?? 0,
        pending: pendingRow?.n ?? 0,
        overdue: overdueRow?.n ?? 0,
      };
    } catch (error) {
      this.logger.error('Failed to fetch rotation metrics', error);
      return { completed: 0, pending: 0, overdue: 0 };
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Sla Trend' })
  @Get('sla-trend')
  async getSlaTrend(@Query('range') range?: string) {
    const days = this.getRangeDays(range ?? '30d');
    const dataPoints = Math.min(10, days);
    const values: number[] = [];

    try {
      // Calculate SLA compliance percentage for each time bucket
      for (let i = dataPoints - 1; i >= 0; i--) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - i * Math.floor(days / dataPoints));
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - Math.floor(days / dataPoints));

        const [row] = await this.dataSource.query(
          `SELECT 
             COUNT(CASE WHEN status = 'INACTIVE' THEN 1 END)::float / NULLIF(COUNT(*)::float, 0) * 100 AS compliance
           FROM client_assignments
           WHERE created_at BETWEEN $1 AND $2`,
          [startDate, endDate],
        );

        values.push(Math.round(row?.compliance ?? 0));
      }
    } catch (error) {
      this.logger.error('Failed to fetch SLA trend', error);
      return { values: Array(10).fill(0) };
    }

    return { values };
  }

  private async getSystemHealth(): Promise<{
    inactiveUsers15d: number;
    unassignedClients: number;
    failedNotifications7d: number;
    failedJobs24h: number;
  }> {
    try {
      const since15d = new Date();
      since15d.setDate(since15d.getDate() - 15);

      const since7d = new Date();
      since7d.setDate(since7d.getDate() - 7);

      const since24h = new Date();
      since24h.setHours(since24h.getHours() - 24);

      // Count inactive users (no login in 15 days)
      const [inactiveUsersRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM users
         WHERE is_active = true AND deleted_at IS NULL AND (last_login_at IS NULL OR last_login_at < $1)`,
        [since15d],
      );

      // Count unassigned clients
      const [unassignedClientsRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM clients c
         WHERE (c.is_deleted = false OR c.is_deleted IS NULL)
           AND (c.is_active = true OR c.is_active IS NULL)
           AND NOT EXISTS (
             SELECT 1 FROM client_assignments ca
             WHERE ca.client_id = c.id AND ca.status = 'ACTIVE'
           )`,
      );

      // Count failed notifications (7 days)
      const [failedNotificationsRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM notifications
         WHERE status = 'FAILED' AND created_at >= $1`,
        [since7d],
      );

      // Count failed jobs (24 hours)
      const [failedJobsRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n
         FROM information_schema.tables
         WHERE table_name = 'background_jobs'`,
      );
      const failedJobsCount = failedJobsRow?.n
        ? ((
            await this.dataSource.query(
              `SELECT COUNT(*)::int AS n FROM background_jobs
             WHERE status = 'FAILED' AND created_at >= $1`,
              [since24h],
            )
          )[0]?.n ?? 0)
        : 0;

      return {
        inactiveUsers15d: inactiveUsersRow?.n ?? 0,
        unassignedClients: unassignedClientsRow?.n ?? 0,
        failedNotifications7d: failedNotificationsRow?.n ?? 0,
        failedJobs24h: failedJobsCount,
      };
    } catch (error) {
      this.logger.error('Error fetching system health:', error);
      return {
        inactiveUsers15d: 0,
        unassignedClients: 0,
        failedNotifications7d: 0,
        failedJobs24h: 0,
      };
    }
  }

  private getRange(range: string): string {
    if (range === '7d' || range === '90d' || range === '30d') return range;
    return '30d';
  }

  private getRangeDays(range: string): number {
    const normalized = this.getRange(range);
    switch (normalized) {
      case '7d':
        return 7;
      case '90d':
        return 90;
      case '30d':
      default:
        return 30;
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Stats' })
  @Get('stats')
  async getStats(@Query('range') range: string) {
    const days = this.getRangeDays(range);
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      const [pendingApprovalsRow] = await this.dataSource
        .query(
          `SELECT COUNT(*)::int AS n FROM approval_requests WHERE status = 'PENDING'`,
        )
        .catch((e) => {
          this.logger.warn('approval_requests count failed', e?.message);
          return [{ n: 0 }];
        });

      const [overdueTasksRow] = await this.dataSource
        .query(
          `SELECT COUNT(*)::int AS n FROM client_assignments WHERE status = 'ACTIVE' AND end_date IS NOT NULL AND end_date < CURRENT_DATE`,
        )
        .catch((e) => {
          this.logger.warn('overdue_tasks count failed', e?.message);
          return [{ n: 0 }];
        });

      // Real query: open helpdesk tickets
      const [openQueriesRow] = await this.dataSource
        .query(
          `SELECT COUNT(*)::int AS n FROM helpdesk_tickets WHERE status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT')`,
        )
        .catch((e) => {
          this.logger.warn('helpdesk open count failed', e?.message);
          return [{ n: 0 }];
        });

      // Real query: SLA breaches (tickets where SLA due date has passed and not resolved)
      const [slaBreachesRow] = await this.dataSource
        .query(
          `SELECT COUNT(*)::int AS n FROM helpdesk_tickets
         WHERE sla_due_at < NOW()
           AND status NOT IN ('RESOLVED', 'CLOSED')`,
        )
        .catch((e) => {
          this.logger.warn('sla breaches count failed', e?.message);
          return [{ n: 0 }];
        });

      // Real query: unread notifications
      const [unreadNotificationsRow] = await this.dataSource
        .query(
          `SELECT COUNT(*)::int AS n FROM notifications
         WHERE read_at IS NULL AND created_at >= $1`,
          [since],
        )
        .catch((e) => {
          this.logger.warn('unread notifications count failed', e?.message);
          return [{ n: 0 }];
        });

      return {
        clients: await this.safeCountActive('clients'),
        branches: await this.safeCountActive('client_branches'),
        users: await this.safeCount('users'),
        openQueries: openQueriesRow?.n ?? 0,
        overdueTasks: overdueTasksRow?.n ?? 0,
        slaBreaches: slaBreachesRow?.n ?? 0,
        pendingApprovals: pendingApprovalsRow?.n ?? 0,
        unreadNotifications: unreadNotificationsRow?.n ?? 0,
      };
    } catch (error) {
      this.logger.error('Failed to fetch KPI cards', error);
      return {
        clients: await this.safeCountActive('clients'),
        branches: await this.safeCountActive('client_branches'),
        users: await this.safeCount('users'),
        openQueries: 0,
        overdueTasks: 0,
        slaBreaches: 0,
        pendingApprovals: 0,
        unreadNotifications: 0,
      };
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Crm Load' })
  @Get('crm-load')
  async getCrmLoad() {
    try {
      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.name,
           u.email,
           COUNT(DISTINCT a.id) as "clientsAssigned",
           COUNT(DISTINCT CASE WHEN a.status = 'ACTIVE' THEN a.id END) as "openItems",
           COUNT(DISTINCT CASE WHEN a.status = 'ACTIVE' AND a.end_date IS NOT NULL AND a.end_date < CURRENT_DATE THEN a.id END) as overdue,
           COALESCE((SELECT COUNT(*)::int FROM helpdesk_tickets ht
             INNER JOIN clients hc ON hc.id = ht.client_id
             INNER JOIN client_assignments ha ON ha.client_id = hc.id AND ha.crm_user_id = u.id AND ha.status = 'ACTIVE'
             WHERE ht.sla_due_at < NOW() AND ht.status NOT IN ('RESOLVED','CLOSED')
           ), 0) as "slaBreaches"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         LEFT JOIN client_assignments a ON a.crm_user_id = u.id AND a.status = 'ACTIVE'
         WHERE r.code = 'CRM' AND u.is_active = true AND u.deleted_at IS NULL
         GROUP BY u.id, u.name, u.email
         ORDER BY COUNT(DISTINCT a.id) DESC
         LIMIT 10`,
      );
      return rows;
    } catch (error) {
      this.logger.error('Failed to fetch CRM load', error);
      return [];
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Auditor Load' })
  @Get('auditor-load')
  async getAuditorLoad() {
    try {
      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.name,
           u.email,
           COUNT(DISTINCT c.id) as "clientsAssigned",
           COUNT(DISTINCT CASE WHEN au.status IN ('PENDING', 'IN_PROGRESS') THEN au.id END) as "openItems",
           COUNT(DISTINCT CASE WHEN au.status = 'OVERDUE' THEN au.id END) as overdue,
           COALESCE((SELECT COUNT(*)::int FROM audits sla_a
             WHERE sla_a.assigned_auditor_id = u.id
               AND sla_a.due_date < NOW()
               AND sla_a.status NOT IN ('COMPLETED', 'CLOSED')
           ), 0) as "slaBreaches"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         LEFT JOIN audits au ON au.assigned_auditor_id = u.id
         LEFT JOIN clients c ON au.client_id = c.id
         WHERE r.code = 'AUDITOR' AND u.is_active = true AND u.deleted_at IS NULL
         GROUP BY u.id, u.name, u.email
         ORDER BY COUNT(DISTINCT au.id) DESC
         LIMIT 10`,
      );
      return rows;
    } catch (error) {
      this.logger.error('Failed to fetch auditor load', error);
      return [];
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Attention' })
  @Get('attention')
  async getAttention(@Query('range') range: string) {
    const days = this.getRangeDays(range);
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      const rows = await this.dataSource.query(
        `SELECT 
           'assignment' as type,
           ca.id::text,
           c.client_name as title,
           'Overdue assignment' as reason,
           COALESCE(ca.updated_at, ca.end_date::timestamp) as "lastUpdate"
         FROM client_assignments ca
         INNER JOIN clients c ON ca.client_id = c.id
         WHERE ca.status = 'ACTIVE'
           AND ca.end_date IS NOT NULL AND ca.end_date < CURRENT_DATE
           AND (ca.updated_at IS NULL OR ca.updated_at >= $1)
         ORDER BY COALESCE(ca.updated_at, ca.end_date::timestamp) DESC
         LIMIT 10`,
        [since],
      );
      return rows;
    } catch (error) {
      this.logger.error('Failed to fetch attention items', error);
      return [];
    }
  }

  // ───── Governance Layer Endpoints ─────

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Assignment Summary' })
  @Get('assignment-summary')
  async getAssignmentSummary() {
    try {
      const [row] = await this.dataSource.query(`
        SELECT
          (SELECT COUNT(*)::int FROM clients
           WHERE (is_deleted = false OR is_deleted IS NULL)
             AND (is_active = true OR is_active IS NULL)) AS "totalClients",

          (SELECT COUNT(*)::int FROM clients
           WHERE (is_deleted = false OR is_deleted IS NULL)
             AND (is_active = true OR is_active IS NULL)
             AND assigned_crm_id IS NOT NULL) AS "crmAssigned",

          (SELECT COUNT(*)::int FROM clients
           WHERE (is_deleted = false OR is_deleted IS NULL)
             AND (is_active = true OR is_active IS NULL)
             AND assigned_crm_id IS NULL) AS "crmUnassigned",

          (SELECT COUNT(*)::int FROM clients
           WHERE (is_deleted = false OR is_deleted IS NULL)
             AND (is_active = true OR is_active IS NULL)
             AND assigned_auditor_id IS NOT NULL) AS "auditorAssigned",

          (SELECT COUNT(*)::int FROM clients
           WHERE (is_deleted = false OR is_deleted IS NULL)
             AND (is_active = true OR is_active IS NULL)
             AND assigned_auditor_id IS NULL) AS "auditorUnassigned"
      `);
      return row;
    } catch (error) {
      this.logger.error('Error fetching assignment summary:', error);
      return {
        totalClients: 0,
        crmAssigned: 0,
        crmUnassigned: 0,
        auditorAssigned: 0,
        auditorUnassigned: 0,
      };
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Unassigned Clients' })
  @Get('unassigned-clients')
  async getUnassignedClients() {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          c.id AS "clientId",
          c.client_name AS "clientName",
          COALESCE(bc.cnt, 0)::int AS "branchCount",
          (c.assigned_crm_id IS NOT NULL) AS "hasCrm",
          EXISTS(
            SELECT 1 FROM client_users cu
            JOIN users u ON cu.user_id = u.id
            JOIN roles r ON u.role_id = r.id
            WHERE cu.client_id = c.id AND r.code = 'PAYROLL'
              AND u.is_active = true AND u.deleted_at IS NULL
          ) AS "hasPayrollUser",
          EXISTS(
            SELECT 1 FROM client_users cu
            JOIN users u ON cu.user_id = u.id
            JOIN roles r ON u.role_id = r.id
            WHERE cu.client_id = c.id AND r.code = 'CLIENT'
              AND u.is_active = true AND u.deleted_at IS NULL
          ) AS "hasMasterUser"
        FROM clients c
        LEFT JOIN (
          SELECT clientid, COUNT(*)::int AS cnt
          FROM client_branches
          WHERE (isactive = true OR isactive IS NULL)
            AND (isdeleted = false OR isdeleted IS NULL)
          GROUP BY clientid
        ) bc ON bc.clientid = c.id
        WHERE (c.is_deleted = false OR c.is_deleted IS NULL)
          AND (c.is_active = true OR c.is_active IS NULL)
          AND (
            c.assigned_crm_id IS NULL
            OR c.assigned_auditor_id IS NULL
            OR NOT EXISTS(
              SELECT 1 FROM client_users cu
              JOIN users u ON cu.user_id = u.id
              JOIN roles r ON u.role_id = r.id
              WHERE cu.client_id = c.id AND r.code = 'PAYROLL'
                AND u.is_active = true AND u.deleted_at IS NULL
            )
            OR NOT EXISTS(
              SELECT 1 FROM client_users cu
              JOIN users u ON cu.user_id = u.id
              JOIN roles r ON u.role_id = r.id
              WHERE cu.client_id = c.id AND r.code = 'CLIENT'
                AND u.is_active = true AND u.deleted_at IS NULL
            )
          )
        ORDER BY c.client_name
      `);
      return rows;
    } catch (error) {
      this.logger.error('Error fetching unassigned clients:', error);
      return [];
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Audit Summary' })
  @Get('audit-summary')
  async getAuditSummary() {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          c.id AS "clientId",
          c.client_name AS "clientName",
          MAX(CASE WHEN a.status = 'COMPLETED' THEN a.due_date END) AS "lastAuditDate",
          MIN(CASE WHEN a.status IN ('PLANNED','IN_PROGRESS') AND a.due_date >= CURRENT_DATE THEN a.due_date END) AS "nextDueDate",
          CASE
            WHEN EXISTS(
              SELECT 1 FROM audits oa
              WHERE oa.client_id = c.id
                AND oa.status IN ('PLANNED','IN_PROGRESS')
                AND oa.due_date < CURRENT_DATE
            ) THEN 'OVERDUE'
            WHEN EXISTS(
              SELECT 1 FROM audits pa
              WHERE pa.client_id = c.id
                AND pa.status IN ('PLANNED','IN_PROGRESS')
            ) THEN 'ON_TRACK'
            ELSE 'NO_AUDITS'
          END AS "status",
          COALESCE((
            SELECT COUNT(*)::int FROM audits ca
            WHERE ca.client_id = c.id
              AND ca.status IN ('PLANNED','IN_PROGRESS')
              AND ca.due_date < CURRENT_DATE
          ), 0) AS "overdueCount"
        FROM clients c
        LEFT JOIN audits a ON a.client_id = c.id
        WHERE (c.is_deleted = false OR c.is_deleted IS NULL)
          AND (c.is_active = true OR c.is_active IS NULL)
        GROUP BY c.id, c.client_name
        ORDER BY
          CASE
            WHEN EXISTS(SELECT 1 FROM audits oa WHERE oa.client_id = c.id AND oa.status IN ('PLANNED','IN_PROGRESS') AND oa.due_date < CURRENT_DATE) THEN 0
            ELSE 1
          END,
          c.client_name
      `);
      return rows;
    } catch (error) {
      this.logger.error('Error fetching audit summary:', error);
      return [];
    }
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Risk Alerts' })
  @Get('risk-alerts')
  async getRiskAlerts() {
    try {
      const [auditOverdueRow] = await this.dataSource.query(`
        SELECT COUNT(DISTINCT c.id)::int AS n
        FROM clients c
        JOIN audits a ON a.client_id = c.id
        WHERE (c.is_deleted = false OR c.is_deleted IS NULL) AND (c.is_active = true OR c.is_active IS NULL)
          AND a.status IN ('PLANNED','IN_PROGRESS')
          AND a.due_date < CURRENT_DATE
      `);

      const [noCrmRow] = await this.dataSource.query(`
        SELECT COUNT(*)::int AS n FROM clients
        WHERE (is_deleted = false OR is_deleted IS NULL) AND (is_active = true OR is_active IS NULL) AND assigned_crm_id IS NULL
      `);

      const [noPayrollRow] = await this.dataSource.query(`
        SELECT COUNT(*)::int AS n FROM clients c
        WHERE (c.is_deleted = false OR c.is_deleted IS NULL) AND (c.is_active = true OR c.is_active IS NULL)
          AND NOT EXISTS(
            SELECT 1 FROM client_users cu
            JOIN users u ON cu.user_id = u.id
            JOIN roles r ON u.role_id = r.id
            WHERE cu.client_id = c.id AND r.code = 'PAYROLL'
              AND u.is_active = true AND u.deleted_at IS NULL
          )
      `);

      const [zeroBranchesRow] = await this.dataSource.query(`
        SELECT COUNT(*)::int AS n FROM clients c
        WHERE (c.is_deleted = false OR c.is_deleted IS NULL) AND (c.is_active = true OR c.is_active IS NULL)
          AND NOT EXISTS(
            SELECT 1 FROM client_branches cb
            WHERE cb.clientid = c.id
              AND (cb.isactive = true OR cb.isactive IS NULL)
              AND (cb.isdeleted = false OR cb.isdeleted IS NULL)
          )
      `);

      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      // Check if compliance_documents table exists before querying
      const [tableExists] = await this.dataSource.query(`
        SELECT COUNT(*)::int AS n
        FROM information_schema.tables
        WHERE table_name = 'compliance_documents'
      `);

      let noMcdUploads = 0;
      if (tableExists?.n > 0) {
        const [noMcdRow] = await this.dataSource.query(
          `
          SELECT COUNT(*)::int AS n FROM clients c
          WHERE (c.is_deleted = false OR c.is_deleted IS NULL) AND (c.is_active = true OR c.is_active IS NULL)
            AND NOT EXISTS(
              SELECT 1 FROM compliance_documents cd
              WHERE cd.company_id = c.id
                AND cd.uploaded_at >= $1
            )
        `,
          [firstOfMonth],
        );
        noMcdUploads = noMcdRow?.n ?? 0;
      }

      return {
        auditOverdue: auditOverdueRow?.n ?? 0,
        noCrm: noCrmRow?.n ?? 0,
        noPayroll: noPayrollRow?.n ?? 0,
        zeroBranches: zeroBranchesRow?.n ?? 0,
        noMcdUploads,
      };
    } catch (error) {
      this.logger.error('Error fetching risk alerts:', error);
      return {
        auditOverdue: 0,
        noCrm: 0,
        noPayroll: 0,
        zeroBranches: 0,
        noMcdUploads: 0,
      };
    }
  }

  // ───── Private Helpers ─────

  private async safeCount(table: string): Promise<number> {
    try {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM ${table}`,
      );
      return row?.n ?? 0;
    } catch (error) {
      this.logger.error(`Failed to count ${table}`, error);
      return 0;
    }
  }

  // --- PATCH: Soft-delete aware count helpers ---
  private async safeCountActive(table: string): Promise<number> {
    // Special handling for clients table: check is_deleted = false and is_active = true
    if (table === 'clients') {
      const sql = `SELECT COUNT(*)::int AS n FROM clients WHERE (is_deleted = false OR is_deleted IS NULL) AND (is_active = true OR is_active IS NULL)`;
      const [row] = await this.dataSource.query(sql);
      return row?.n ?? 0;
    }
    // Special handling for client_branches table (matches BranchEntity)
    if (table === 'client_branches') {
      const sql = `SELECT COUNT(*)::int AS n FROM client_branches WHERE (isdeleted = false OR isdeleted IS NULL) AND (isactive = true OR isactive IS NULL)`;
      const [row] = await this.dataSource.query(sql);
      return row?.n ?? 0;
    }
    // Fallback: soft delete column
    const deletedCol = await this.getSoftDeleteColumn(table);
    const sql = deletedCol
      ? `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${deletedCol} IS NULL`
      : `SELECT COUNT(*)::int AS n FROM ${table}`;
    const [row] = await this.dataSource.query(sql);
    return row?.n ?? 0;
  }

  private async getSoftDeleteColumn(table: string): Promise<string | null> {
    const candidates = ['deletedat', 'deleted_at', 'deletedAt'];
    for (const col of candidates) {
      if (await this.hasColumn(table, col)) return col;
    }
    return null;
  }

  private async hasColumn(table: string, column: string): Promise<boolean> {
    const sql = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
    const result = await this.dataSource.query(sql, [table, column]);
    return result.length > 0;
  }
}
