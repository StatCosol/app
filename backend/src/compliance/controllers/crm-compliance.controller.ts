import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { CreateCrmComplianceTaskDto } from '../dto/create-crm-compliance-task.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import {
  ClientScoped,
  CrmAssignmentGuard,
} from '../../assignments/crm-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

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
  kpis(@CurrentUser() user: ReqUser) {
    return this.svc.crmTaskKpis(user);
  }

  @ApiOperation({ summary: 'Bulk Approve' })
  @Post('tasks/bulk-approve')
  bulkApprove(
    @CurrentUser() user: ReqUser,
    @Body() dto: { taskIds: number[]; remarks?: string },
  ) {
    return this.svc.crmBulkApprove(user, dto.taskIds, dto.remarks);
  }

  @ApiOperation({ summary: 'Bulk Reject' })
  @Post('tasks/bulk-reject')
  bulkReject(
    @CurrentUser() user: ReqUser,
    @Body() dto: { taskIds: number[]; remarks: string },
  ) {
    return this.svc.crmBulkReject(user, dto.taskIds, dto.remarks);
  }

  @ApiOperation({ summary: 'Create Task' })
  @Post('tasks')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  createTask(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateCrmComplianceTaskDto,
  ) {
    return this.svc.crmCreateTask(user, dto);
  }

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.crmListTasks(user, q);
  }

  @ApiOperation({ summary: 'Detail' })
  @Get('tasks/:id')
  detail(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.crmGetTaskDetail(user, id);
  }

  @ApiOperation({ summary: 'Assign' })
  @Patch('tasks/:id/assign')
  assign(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { assignedToUserId: string },
  ) {
    return this.svc.crmAssignTask(user, id, dto.assignedToUserId);
  }

  @ApiOperation({ summary: 'Approve' })
  @Post('tasks/:id/approve')
  approve(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.svc.crmApprove(user, id, dto?.remarks);
  }

  @ApiOperation({ summary: 'Reject' })
  @Post('tasks/:id/reject')
  reject(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.crmReject(user, id, dto?.remarks);
  }
}
