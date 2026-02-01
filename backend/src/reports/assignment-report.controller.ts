import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('api/reports/assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentReportController {
  constructor(private readonly ds: DataSource) {}

  @Roles('ADMIN', 'CEO', 'CCO')
  @Get('health')
  health() {
    const sql = `
      SELECT
        c."clientName" AS client_name,
        ca.assignment_type,
        u.email AS assignee,
        ca.start_date,
        CASE
          WHEN ca.assignment_type = 'CRM' THEN ca.start_date + interval '365 days'
          ELSE ca.start_date + interval '120 days'
        END AS rotation_due_date,
        (now()::date - CASE
            WHEN ca.assignment_type = 'CRM' THEN (ca.start_date + interval '365 days')::date
            ELSE (ca.start_date + interval '120 days')::date
         END) AS days_past_due
      FROM client_assignments_current ca
      JOIN clients c ON c.id = ca.client_id
      JOIN users u ON u.id = ca.assigned_to_user_id
      ORDER BY days_past_due DESC
    `;

    return this.ds.query(sql);
  }
}
