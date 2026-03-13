import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco/users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'ADMIN')
export class CcoUsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'List CRM users for CCO' })
  @Get('crms')
  listCrms() {
    return this.usersService.listActiveUsersByRoleCode('CRM');
  }

  @ApiOperation({ summary: 'List auditor users for CCO' })
  @Get('auditors')
  listAuditors() {
    return this.usersService.listActiveUsersByRoleCode('AUDITOR');
  }
}
