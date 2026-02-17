import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

@Controller({ path: 'admin/reports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReportsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('user-activity')
  async getUserActivity(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const whereClause = this.buildDateFilter('u.created_at', from, to);

      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           u.mobile,
           r.name as role,
           r.code as "roleCode",
           u.is_active as "isActive",
           u.created_at as "createdAt",
           u.last_login as "lastLogin"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         ${whereClause ? `WHERE ${whereClause}` : ''}
         ORDER BY u.created_at DESC
         LIMIT 1000`,
      );

      // If download parameter is true, export to Excel
      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'User Activity');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-activity.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      console.error('Error fetching user activity:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('user-registrations')
  async getUserRegistrations(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           u.mobile,
           r.name as "roleName",
           r.code as "roleCode",
           u.is_active as "isActive",
           u.created_at as "createdAt",
           c.client_name as "clientName"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         LEFT JOIN clients c ON u.client_id = c.id
         WHERE u.created_at BETWEEN $1 AND $2
         ORDER BY u.created_at DESC`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'User Registrations');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-registrations.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      console.error('Error fetching user registrations:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('user-deletions')
  async getUserDeletions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           r.name as "roleName",
           r.code as "roleCode",
           u.deleted_at as "deletedAt",
           'Admin' as "deletedBy"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE u.deleted_at IS NOT NULL 
           AND u.deleted_at BETWEEN $1 AND $2
         ORDER BY u.deleted_at DESC`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'User Deletions');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-deletions.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      console.error('Error fetching user deletions:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('access-logs')
  async getAccessLogs(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      // Get login activity from users table
      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           r.name as role,
           u.last_login as "lastLogin",
           u.is_active as "isActive"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE u.last_login BETWEEN $1 AND $2
         ORDER BY u.last_login DESC
         LIMIT 1000`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Access Logs');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=access-logs.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      console.error('Error fetching access logs:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('assignments')
  async getAssignments(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      const rows = await this.dataSource.query(
        `SELECT 
           ca.id,
           c.client_name as "clientName",
           ca.assignment_type as "assignmentType",
           u.name as "assignedUserName",
           ca.status,
           ca.assigned_on as "assignedOn",
           ca.rotation_due_on as "rotationDueOn",
           ca.created_at as "createdAt",
           ca.updated_at as "updatedAt"
         FROM client_assignments ca
         INNER JOIN clients c ON ca.client_id = c.id
         LEFT JOIN users u ON ca.assigned_user_id = u.id
         WHERE ca.created_at BETWEEN $1 AND $2
         ORDER BY ca.created_at DESC
         LIMIT 1000`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Assignments');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=assignments.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      console.error('Error fetching assignments:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  private buildDateFilter(column: string, from?: string, to?: string): string {
    const filters: string[] = [];

    if (from) {
      filters.push(`${column} >= '${from}'`);
    }
    if (to) {
      filters.push(`${column} <= '${to}'`);
    }

    return filters.join(' AND ');
  }
}
