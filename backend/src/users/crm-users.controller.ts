import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller({ path: 'crm/users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('auditors')
  listAuditors() {
    return this.usersService.listActiveUsersByRoleCode('AUDITOR');
  }

  @Get('contractors')
  listContractors() {
    return this.usersService.listActiveUsersByRoleCode('CONTRACTOR');
  }
}
