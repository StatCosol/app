import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditScheduleEngineService } from '../services/audit-schedule-engine.service';
import { CreateManualAuditScheduleDto } from '../../audits/dto/create-manual-audit-schedule.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Audit Schedule Automation')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'audit-schedules', version: '1' })
export class AuditScheduleAutomationController {
  constructor(
    private readonly auditScheduleEngine: AuditScheduleEngineService,
  ) {}

  @ApiOperation({ summary: 'Generate audit schedules now (system)' })
  @Post('auto-generate')
  autoGenerateNow() {
    return this.auditScheduleEngine.generateDueSchedules();
  }

  @ApiOperation({ summary: 'Create audit schedule manually by CRM' })
  @Post('manual')
  createManual(
    @Body() dto: CreateManualAuditScheduleDto,
    @CurrentUser() user: ReqUser,
  ) {
    const crmUserId = user?.id ?? user?.userId;

    return this.auditScheduleEngine.createManualSchedule({
      clientId: dto.clientId,
      auditType: dto.auditType,
      auditorId: dto.auditorId,
      scheduleDate: new Date(dto.scheduleDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      branchId: dto.branchId ?? null,
      contractorId: dto.contractorId ?? null,
      scheduledByCrmId: crmUserId,
      remarks: dto.remarks ?? null,
    });
  }

  @ApiOperation({ summary: 'Get auditor assigned schedules' })
  @Get('auditor')
  getAuditorSchedules(
    @Query('auditorId') auditorId: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('auditType') auditType?: string,
  ) {
    return this.auditScheduleEngine.getAuditorSchedules({
      auditorId,
      status,
      clientId,
      auditType,
    });
  }
}
