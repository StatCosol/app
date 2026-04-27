import { ResetPasswordDto } from './dto/reset-password.dto';
import { Logger } from '@nestjs/common';
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { DataSource } from 'typeorm';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly service: UsersService,
    private readonly config: ConfigService,
    private readonly ds: DataSource,
  ) {}

  @ApiOperation({ summary: 'List CCO users' })
  @Get('users/cco')
  listCcoUsers() {
    return this.service.listActiveUsersByRoleCode('CCO');
  }

  @ApiOperation({ summary: 'Get active users by role' })
  @Get('users/active-by-role/:role')
  getActiveUsersByRole(@Param('role') role: string) {
    return this.service.listActiveUsersByRoleCode(role);
  }

  @ApiOperation({ summary: 'Reset CEO password (not allowed for admin)' })
  @Post('users/reset-ceo-password')
  async resetCeoPassword(@Body() _dto: ResetPasswordDto) {
    // As per product rules, CEO manages their own password/profile.
    // Admin should not directly reset CEO credentials.
    throw new BadRequestException(
      'CEO password reset is not allowed for Admin. CEO must change password from their own account.',
    );
  }

  @ApiOperation({ summary: 'List all roles' })
  @Get('roles')
  listRoles() {
    return this.service.listRoles();
  }

  @ApiOperation({ summary: 'Get role by ID' })
  @Get('roles/:id')
  async getRoleById(@Param('id') id: string) {
    return await this.service.getRoleById(id);
  }

  @ApiOperation({ summary: 'List auditors with pagination' })
  @Get('auditors')
  listAuditors(
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listAuditorsPaged({
      q,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
    });
  }

  @ApiOperation({ summary: 'List users with filtering and pagination' })
  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('roleId') roleId?: string,
    @Query('role') roleCode?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(`[UsersController] GET /api/admin/users`, {
        roleCode,
        roleId,
        clientId,
        q,
        status,
      });
    }

    // If role parameter is provided, return simple array for dropdowns
    if (roleCode) {
      const cid = clientId || undefined;
      return this.service.listActiveUsersByRoleCode(roleCode, cid);
    }

    return this.service.listUsersPaged({
      q,
      roleId: roleId || undefined,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      sortBy,
      sortDir,
    });
  }

  @ApiOperation({ summary: 'List users with role codes (simple)' })
  @Get('users/list')
  listUsersSimple() {
    return this.service.listUsersWithRoleCode();
  }

  @ApiOperation({ summary: 'Export users to Excel' })
  @Get('users/export')
  async exportUsers(@Res() res: Response) {
    const users = await this.service.listUsersWithRoleCode();

    // Transform data for Excel export
    const data = users.map((u) => ({
      'User Code': u.userCode || 'N/A',
      Name: u.name,
      Email: u.email,
      Role: u.roleCode || 'N/A',
      Status: u.isActive ? 'Active' : 'Inactive',
      'Created At': u.createdAt
        ? new Date(u.createdAt).toLocaleDateString()
        : 'N/A',
    }));

    const buffer = await jsonToExcelBuffer(data, 'Users');
    res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }

  @ApiOperation({ summary: 'List client users' })
  @Get('client-users')
  listClientUsers() {
    return this.service.listActiveUsersByRoleCode('CLIENT');
  }

  // Advanced directory: global search + filters + pagination + optional grouping by client
  @ApiOperation({ summary: 'Get user directory with search and filters' })
  @Get('users/directory')
  getDirectory(@Query() q: Record<string, string>) {
    // Accept raw query and let the service coerce types
    return this.service.getUserDirectory(q);
  }

  @ApiOperation({ summary: 'Create a new user' })
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.service.createUser(dto);
  }

  @ApiOperation({ summary: 'Update a user' })
  @Put('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { name?: string; email?: string; mobile?: string },
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.updateUser(id, dto, user?.userId);
  }

  @ApiOperation({ summary: 'Admin reset user password' })
  @Post('users/:id/reset-password')
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminResetPassword(id);
  }

  @ApiOperation({ summary: 'Delete a user' })
  @Delete('users/:id')
  async deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    const actorUserId = user?.userId ?? user?.id;

    // CRM deletion requires CCO approval; others delete immediately
    const roleCode = await this.service.getUserRoleCode(id);
    if (roleCode === 'CRM') {
      return this.service.createUserDeletionRequest(id, actorUserId);
    }
    return this.service.deleteUser(id, actorUserId);
  }

  @ApiOperation({ summary: 'Update user active status' })
  @Patch('users/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.updateUserStatus(id, dto.isActive, user?.userId);
  }

  @ApiOperation({ summary: 'Admin hard-delete employee by code' })
  @Delete('employees/by-code/:code')
  async hardDeleteEmployeeByCode(@Param('code') code: string) {
    const rows = await this.ds.query(
      `SELECT id, client_id FROM employees WHERE employee_code = $1`,
      [code],
    );
    if (!rows.length)
      throw new BadRequestException(`Employee ${code} not found`);
    const { id, client_id: _clientId } = rows[0];
    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `DELETE FROM employee_nomination_members WHERE nomination_id IN (SELECT id FROM employee_nominations WHERE employee_id = $1)`,
        [id],
      );
      await mgr.query(
        `DELETE FROM employee_nominations WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(
        `DELETE FROM employee_generated_forms WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(`DELETE FROM employee_documents WHERE employee_id = $1`, [
        id,
      ]);
      await mgr.query(`DELETE FROM employee_statutory WHERE employee_id = $1`, [
        id,
      ]);
      await mgr.query(
        `DELETE FROM employee_salary_revisions WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(`DELETE FROM attendance_records WHERE employee_id = $1`, [
        id,
      ]);
      await mgr.query(`DELETE FROM leave_ledger WHERE employee_id = $1`, [id]);
      await mgr.query(`DELETE FROM leave_balances WHERE employee_id = $1`, [
        id,
      ]);
      await mgr.query(`DELETE FROM leave_applications WHERE employee_id = $1`, [
        id,
      ]);
      await mgr.query(
        `DELETE FROM payroll_run_component_values WHERE run_employee_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = $1)`,
        [id],
      );
      await mgr.query(
        `DELETE FROM payroll_run_items WHERE run_employee_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = $1)`,
        [id],
      );
      await mgr.query(`DELETE FROM pay_calc_traces WHERE employee_id = $1`, [
        id,
      ]);
      await mgr.query(
        `DELETE FROM payroll_run_employees WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(`DELETE FROM payroll_fnf WHERE employee_id = $1`, [id]);
      await mgr.query(
        `UPDATE pay_salary_structures SET employee_id = NULL WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(
        `UPDATE payroll_queries SET employee_id = NULL WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(
        `UPDATE ai_payroll_anomalies SET employee_id = NULL WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(
        `UPDATE users SET employee_id = NULL WHERE employee_id = $1`,
        [id],
      );
      await mgr.query(`DELETE FROM employees WHERE id = $1`, [id]);
    });
    return { deleted: true, employeeCode: code, employeeId: id };
  }
}
