import {
  NotFoundException,
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
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';
import { DataSource } from 'typeorm';

@ApiTags('CRM – Expiry Tasks')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/expiry-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class CrmExpiryController {
  constructor(
    private readonly expiryTaskService: ExpiryTaskService,
    private readonly access: AccessScopeService,
    private readonly ds: DataSource,
  ) {}

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
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: string; notes?: string },
  ) {
    // By id alone a CRM could change any client's expiry task.
    const [task] = await this.ds.query(
      `SELECT branch_id FROM registration_expiry_tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw new NotFoundException('Expiry task not found');
    await this.access.assertBranchAllowed(user, task.branch_id);
    return this.expiryTaskService.updateStatus(id, body.status, body.notes);
  }
}
