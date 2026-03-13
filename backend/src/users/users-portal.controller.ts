import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersPortalController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    const rows = await this.usersService.listUsersWithRoleCode();
    return rows.map((row) => ({
      id: row.id,
      fullName: row.name,
      email: row.email,
      role: row.roleCode,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }));
  }

  @Post()
  async create(
    @Body()
    dto: {
      fullName: string;
      email: string;
      role: string;
      password?: string;
      isActive?: boolean;
      clientId?: string;
      ownerCcoId?: string;
      userType?: 'MASTER' | 'BRANCH';
      branchIds?: string[];
      mobile?: string;
    },
  ) {
    if (!dto.fullName?.trim()) {
      throw new BadRequestException('fullName is required');
    }
    if (!dto.email?.trim()) {
      throw new BadRequestException('email is required');
    }
    if (!dto.role?.trim()) {
      throw new BadRequestException('role is required');
    }

    const normalizedRole = dto.role.trim().toUpperCase();
    const roleId = await this.usersService.getRoleId(normalizedRole);

    let ownerCcoId = dto.ownerCcoId ?? undefined;
    if (normalizedRole === 'CRM' && !ownerCcoId) {
      const ccos = await this.usersService.listActiveUsersByRoleCode('CCO');
      ownerCcoId = ccos?.[0]?.id;
      if (!ownerCcoId) {
        throw new BadRequestException(
          'No active CCO user found. Please create a CCO first or pass ownerCcoId.',
        );
      }
    }

    const created = await this.usersService.createUser({
      roleId,
      name: dto.fullName.trim(),
      email: dto.email.trim().toLowerCase(),
      mobile: dto.mobile?.trim() || undefined,
      password: dto.password?.trim() || undefined,
      clientId: dto.clientId || undefined,
      ownerCcoId,
      userType: dto.userType,
      branchIds: dto.branchIds,
    });

    if (dto.isActive === false && created?.id) {
      await this.usersService.updateUserStatus(created.id, false);
    }

    return created;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: {
      fullName?: string;
      email?: string;
      role?: string;
      password?: string;
      isActive?: boolean;
      mobile?: string;
    },
    @Req() req: any,
  ) {
    return this.usersService.updateUserFromPortal(id, dto, req.user?.userId);
  }
}
