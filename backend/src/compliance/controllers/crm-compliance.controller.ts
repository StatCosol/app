import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import {
  ClientScoped,
  CrmAssignmentGuard,
} from '../../assignments/crm-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/compliance-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceTasksController {
  constructor(private readonly svc: ComplianceService) {}

  /** KPIs must come before :id to avoid route conflict */
  @ApiOperation({ summary: 'Kpis' })
  @Get('tasks/kpis')
  kpis(@Req() req: any) {
    return this.svc.crmTaskKpis(req.user);
  }

  @ApiOperation({ summary: 'Bulk Approve' })
  @Post('tasks/bulk-approve')
  bulkApprove(
    @Req() req: any,
    @Body() dto: { taskIds: number[]; remarks?: string },
  ) {
    return this.svc.crmBulkApprove(req.user, dto.taskIds, dto.remarks);
  }

  @ApiOperation({ summary: 'Bulk Reject' })
  @Post('tasks/bulk-reject')
  bulkReject(
    @Req() req: any,
    @Body() dto: { taskIds: number[]; remarks: string },
  ) {
    return this.svc.crmBulkReject(req.user, dto.taskIds, dto.remarks);
  }

  @ApiOperation({ summary: 'Create Task' })
  @Post('tasks')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  createTask(@Req() req: any, @Body() dto: any) {
    return this.svc.crmCreateTask(req.user, dto);
  }

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  list(@Req() req: any, @Query() q: any) {
    return this.svc.crmListTasks(req.user, q);
  }

  @ApiOperation({ summary: 'Detail' })
  @Get('tasks/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.svc.crmGetTaskDetail(req.user, id);
  }

  @ApiOperation({ summary: 'Assign' })
  @Patch('tasks/:id/assign')
  assign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { assignedToUserId: string },
  ) {
    return this.svc.crmAssignTask(req.user, id, dto.assignedToUserId);
  }

  @ApiOperation({ summary: 'Approve' })
  @Post('tasks/:id/approve')
  approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.svc.crmApprove(req.user, id, dto?.remarks);
  }

  @ApiOperation({ summary: 'Reject' })
  @Post('tasks/:id/reject')
  reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.crmReject(req.user, id, dto?.remarks);
  }
}
