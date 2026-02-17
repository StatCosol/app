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
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly service: UsersService) {}

  @Get('users/cco')
  listCcoUsers() {
    return this.service.listActiveUsersByRoleCode('CCO');
  }

  @Get('users/active-by-role/:role')
  getActiveUsersByRole(@Param('role') role: string) {
    return this.service.listActiveUsersByRoleCode(role);
  }

  @Post('users/reset-ceo-password')
  async resetCeoPassword(@Body() dto: ResetPasswordDto) {
    // As per product rules, CEO manages their own password/profile.
    // Admin should not directly reset CEO credentials.
    throw new BadRequestException(
      'CEO password reset is not allowed for Admin. CEO must change password from their own account.',
    );
  }

  @Get('roles')
  listRoles() {
    return this.service.listRoles();
  }

  @Get('roles/:id')
  async getRoleById(@Param('id') id: string) {
    return await this.service.getRoleById(id);
  }

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
    if (process.env.NODE_ENV !== 'production') {
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

  @Get('users/list')
  listUsersSimple() {
    return this.service.listUsersWithRoleCode();
  }

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

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }

  @Get('client-users')
  listClientUsers() {
    return this.service.listActiveUsersByRoleCode('CLIENT');
  }

  // TEMP diagnostic: dump raw DB state for all users
  @Get('users/debug-deleted')
  async debugDeleted() {
    const rows = await this.service.debugGetAllUsersRaw();
    return rows;
  }

  // Advanced directory: global search + filters + pagination + optional grouping by client
  @Get('users/directory')
  getDirectory(@Query() q: any) {
    // Accept raw query and let the service coerce types
    return this.service.getUserDirectory(q);
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.service.createUser(dto);
  }

  @Delete('users/:id')
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    // Instead of immediate deletion, create a deletion request that will be
    // routed to the appropriate approver (CCO / owner CCO for CRM).
    return this.service.createUserDeletionRequest(id, req.user?.userId);
  }

  @Patch('users/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: any,
  ) {
    return this.service.updateUserStatus(id, dto.isActive, req.user?.userId);
  }
}
