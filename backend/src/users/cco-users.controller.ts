import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('api/cco/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'ADMIN')
export class CcoUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('crms')
  listCrms() {
    return this.usersService.listActiveUsersByRoleCode('CRM');
  }

  @Get('auditors')
  listAuditors() {
    return this.usersService.listActiveUsersByRoleCode('AUDITOR');
  }
}
