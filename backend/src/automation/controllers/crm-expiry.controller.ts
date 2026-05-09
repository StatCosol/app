import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ExpiryTaskService } from '../services/expiry-task.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('CRM – Expiry Tasks')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/expiry-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class CrmExpiryController {
  constructor(private readonly expiryTaskService: ExpiryTaskService) {}

  @ApiOperation({ summary: 'List expiry tasks for CRM' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
    @Query('daysThreshold') daysThreshold?: string,
  ) {
    return this.expiryTaskService.listForCrm(user.userId, {
      status,
      daysThreshold: daysThreshold ? parseInt(daysThreshold, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'KPI summary for CRM expiry tasks' })
  @Get('kpi')
  async kpi(@CurrentUser() user: ReqUser) {
    return this.expiryTaskService.getKpiSummary(undefined, user.userId);
  }

  @ApiOperation({ summary: 'Update expiry task status' })
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: string; notes?: string },
  ) {
    return this.expiryTaskService.updateStatus(id, body.status, body.notes);
  }
}
