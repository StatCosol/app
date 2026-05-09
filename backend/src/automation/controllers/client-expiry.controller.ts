import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ExpiryTaskService } from '../services/expiry-task.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Client – Expiry Tasks')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/expiry-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CLIENT')
export class ClientExpiryController {
  constructor(private readonly expiryTaskService: ExpiryTaskService) {}

  @ApiOperation({ summary: 'List expiry tasks for client' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    return this.expiryTaskService.listForClient(user.clientId!);
  }

  @ApiOperation({ summary: 'KPI summary for client expiry tasks' })
  @Get('kpi')
  async kpi(@CurrentUser() user: ReqUser) {
    return this.expiryTaskService.getKpiSummary(user.clientId!);
  }
}
