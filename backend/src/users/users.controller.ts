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
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';


@Controller('api/admin')
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

  @Get('client-users')
  listClientUsers() {
    return this.service.listActiveUsersByRoleCode('CLIENT');
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
