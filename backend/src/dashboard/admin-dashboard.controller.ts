import { Controller, Get, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/roles.decorator';

@Controller('api/admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dataSource: DataSource) {}

  // Frontend (DashboardService.admin()) calls GET /api/admin/dashboard.
  // Keep this as an alias of /summary so the shell can load without special-casing.
  @Roles('ADMIN', 'CEO', 'CCO')
  @Get()
  async base() {
    return this.summary();
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @Get('clients-minimal')
  async clientsMinimal() {
    return this.dataSource.query(
      `SELECT id, client_name AS name FROM clients ORDER BY client_name ASC`,
    );
  }

  @Roles('ADMIN', 'CEO', 'CCO')
  @Get('summary')
  async summary(
    @Query('clientId') clientId?: string,
    @Query('stateCode') stateCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const clients = await this.safeCountActive('clients');
    const branches = await this.safeCountActive('client_branches');

    return {
      clients,
      branches,
      avgCompliancePercent: 0,
      overdueAudits: 0,
      assignmentsDueSoon: 0,
      adminUnreadThreads: 0,
      lowestCompliance: [],
      mostOverdueAudits: [],
      assignmentHealthTop: [],
    };
  }

  @Get('task-status')
  async getTaskStatus(@Query('range') range?: string) {
    range = range ?? '30d';
    return { completed: 0, pending: 0, overdue: 0 };
  }

  @Get('sla-trend')
  async getSlaTrend(@Query('range') range?: string) {
    this.getRange(range ?? '30d');
    return { values: Array(10).fill(0) };
  }

  private getRange(range: string): string {
    if (range === '7d' || range === '90d' || range === '30d') return range;
    return '30d';
  }

  @Get('stats')
  async getStats(@Query('range') range: string) {
    this.getRange(range);
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

  @Get('crm-load')
  async getCrmLoad() {
    return [];
  }

  @Get('auditor-load')
  async getAuditorLoad() {
    return [];
  }

  @Get('attention')
  async getAttention(@Query('range') range: string) {
    this.getRange(range);
    return [];
  }

  private async safeCount(table: string): Promise<number> {
    try {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM ${table}`,
      );
      return row?.n ?? 0;
    } catch {
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
