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

@Controller({ path: 'crm/compliance-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceTasksController {
  constructor(private readonly svc: ComplianceService) {}

  @Post('tasks')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  createTask(@Req() req: any, @Body() dto: any) {
    return this.svc.crmCreateTask(req.user, dto);
  }

  @Get('tasks')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  list(@Req() req: any, @Query() q: any) {
    return this.svc.crmListTasks(req.user, q);
  }

  @Get('tasks/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.svc.crmGetTaskDetail(req.user, id);
  }

  @Patch('tasks/:id/assign')
  assign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { assignedToUserId: string },
  ) {
    return this.svc.crmAssignTask(req.user, id, dto.assignedToUserId);
  }

  @Post('tasks/:id/approve')
  approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.svc.crmApprove(req.user, id, dto?.remarks);
  }

  @Post('tasks/:id/reject')
  reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.crmReject(req.user, id, dto?.remarks);
  }
}
