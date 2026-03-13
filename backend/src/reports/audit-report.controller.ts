import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'reports/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditReportController {
  constructor(private readonly ds: DataSource) {}

  @Roles('ADMIN', 'CEO', 'CCO', 'AUDITOR')
  @ApiOperation({ summary: 'Overdue' })
  @Get('overdue')
  async overdue(@CurrentUser() user: any) {
    const base = `
      SELECT
        c."clientName" AS client_name,
        b."branchName" AS branch_name,
        a.audit_type,
        a.due_date,
        (now()::date - a.due_date::date) AS days_overdue,
        u.email AS assigned_auditor
      FROM audits a
      JOIN client_branches b ON b.id = a.branch_id
      JOIN clients c ON c.id = b."clientId"
      LEFT JOIN users u ON u.id = a.assigned_auditor_id
      WHERE a.status <> 'COMPLETED'
        AND a.due_date < now()
    `;

    const params: any[] = [];
    let sql = base;

    if (user?.roleCode === 'AUDITOR') {
      sql += ' AND a.assigned_auditor_id = $1';
      params.push(user.id);
    }

    sql += ' ORDER BY days_overdue DESC';

    return this.ds.query(sql, params);
  }
}
