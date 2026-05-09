import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmUsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'List auditors for CRM' })
  @Get('auditors')
  listAuditors() {
    return this.usersService.listActiveUsersByRoleCode('AUDITOR');
  }

  @ApiOperation({ summary: 'List contractors for CRM' })
  @Get('contractors')
  listContractors(@Query('clientId') clientId?: string) {
    return this.usersService.listActiveUsersByRoleCode('CONTRACTOR', clientId);
  }
}
