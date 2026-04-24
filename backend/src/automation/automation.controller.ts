import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { NonComplianceEngineService } from './services/non-compliance-engine.service';
import { AuditOutputEngineService } from './services/audit-output-engine.service';
import { ApplicabilityEngineService } from './services/applicability-engine.service';
import { MonthlyCycleEngineService } from './services/monthly-cycle-engine.service';
import { AuditScheduleEngineService } from './services/audit-schedule-engine.service';
import { ExpiryEngineService } from './services/expiry-engine.service';
import { TaskEngineService } from './services/task-engine.service';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Automation')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'automation', version: '1' })
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly auditOutputEngine: AuditOutputEngineService,
    private readonly applicabilityEngine: ApplicabilityEngineService,
    private readonly cycleEngine: MonthlyCycleEngineService,
    private readonly scheduleEngine: AuditScheduleEngineService,
    private readonly expiryEngine: ExpiryEngineService,
    private readonly taskEngine: TaskEngineService,
  ) {}

  @ApiOperation({ summary: 'Automation engine health check' })
  @Get('health')
  health() {
    return this.automationService.health();
  }

  // ── Manual triggers (Admin only) ──────────────────────────

  @ApiOperation({ summary: 'Trigger NC reminders manually' })
  @Roles('ADMIN')
  @Post('triggers/nc-reminders')
  async triggerNcReminders() {
    return this.ncEngine.sendDailyReminders();
  }

  @ApiOperation({ summary: 'Trigger audit output refresh' })
  @Roles('ADMIN', 'CRM')
  @Post('triggers/audit-output/:auditId')
  async triggerAuditRefresh(@Param('auditId', ParseUUIDPipe) auditId: string) {
    return this.auditOutputEngine.refreshAuditOutputs(auditId);
  }

  @ApiOperation({ summary: 'Trigger applicability recompute for a branch' })
  @Roles('ADMIN')
  @Post('triggers/applicability/:branchId')
  async triggerApplicability(
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.applicabilityEngine.recomputeBranchApplicability(branchId);
  }

  @ApiOperation({ summary: 'Trigger applicability recompute for all branches' })
  @Roles('ADMIN')
  @Post('triggers/applicability-all')
  async triggerApplicabilityAll() {
    return this.applicabilityEngine.recomputeAllBranches();
  }

  @ApiOperation({ summary: 'Trigger monthly compliance cycle opening' })
  @Roles('ADMIN')
  @Post('triggers/monthly-cycle')
  async triggerMonthlyCycle() {
    const now = new Date();
    return this.cycleEngine.openMonthlyCycle(
      now.getMonth() + 1,
      now.getFullYear(),
    );
  }

  @ApiOperation({ summary: 'Trigger audit schedule generation' })
  @Roles('ADMIN')
  @Post('triggers/audit-schedules')
  async triggerAuditSchedules() {
    return this.scheduleEngine.generateDueSchedules();
  }

  @ApiOperation({ summary: 'Trigger expiry alerts' })
  @Roles('ADMIN')
  @Post('triggers/expiry-alerts')
  async triggerExpiryAlerts() {
    return this.expiryEngine.generateExpiryAlerts();
  }

  // ── Task center endpoints ──────────────────────────────────

  @ApiOperation({ summary: 'Get task summary for current user' })
  @Get('tasks/summary/:userId/:role')
  async getTaskSummary(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('role') role: string,
  ) {
    return this.taskEngine.getUserTaskSummary(userId, role);
  }

  @ApiOperation({ summary: 'Get pending tasks for current user' })
  @Get('tasks/pending/:userId/:role')
  async getPendingTasks(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('role') role: string,
  ) {
    return this.taskEngine.getUserTasks(userId, role);
  }

  @ApiOperation({ summary: 'Get overdue tasks (for CRM/Admin)' })
  @Roles('ADMIN', 'CRM')
  @Get('tasks/overdue')
  async getOverdueTasks() {
    return this.taskEngine.getOverdueTasks();
  }

  @ApiOperation({ summary: 'Get tasks due within 3 days' })
  @Get('tasks/due-soon')
  async getDueSoonTasks() {
    return this.taskEngine.getTasksDueSoon(3);
  }
}
