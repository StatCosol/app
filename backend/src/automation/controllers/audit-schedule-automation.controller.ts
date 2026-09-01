import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditScheduleEngineService } from '../services/audit-schedule-engine.service';
import { CreateManualAuditScheduleDto } from '../../audits/dto/create-manual-audit-schedule.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

/**
 * Carried no @Roles at all, and RolesGuard admits everyone when the decorator
 * is absent — so any authenticated user could trigger a system-wide schedule
 * generation, create audit schedules for any client, and read any auditor's
 * schedule. All three are now restricted.
 */
@ApiTags('Audit Schedule Automation')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'AUDITOR')
@Controller({ path: 'audit-schedules', version: '1' })
export class AuditScheduleAutomationController {
  constructor(
    private readonly auditScheduleEngine: AuditScheduleEngineService,
  ) {}

  /** System-wide generation across every client — administrators only. */
  @ApiOperation({ summary: 'Generate audit schedules now (system)' })
  @Roles('ADMIN')
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
    @CurrentUser() user: ReqUser,
    @Query('auditorId') auditorId?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('auditType') auditType?: string,
  ) {
    // An auditor may only ever read their own schedule; anyone else must say
    // whose they want. Previously auditorId came straight off the query with
    // no check, so one auditor could enumerate another's assignments.
    const effectiveAuditorId =
      user?.roleCode === 'AUDITOR' ? (user.userId ?? user.id) : auditorId;
    if (!effectiveAuditorId) {
      throw new BadRequestException('auditorId is required');
    }

    return this.auditScheduleEngine.getAuditorSchedules({
      auditorId: effectiveAuditorId,
      status,
      clientId,
      auditType,
    });
  }
}
