import { AutomationControlService } from '../control-center.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ReturnsFilingEngineService } from '../services/returns-filing-engine.service';
import { RenewalFilingEngineService } from '../services/renewal-filing-engine.service';

@ApiTags('Automation – Returns/Filings')
@ApiBearerAuth('JWT')
@Controller({ path: 'automation/returns-filing', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class ReturnsFilingAutomationController {
  constructor(
    private readonly controls: AutomationControlService,
    private readonly filingEngine: ReturnsFilingEngineService,
    private readonly renewalEngine: RenewalFilingEngineService,
  ) {}

  @ApiOperation({
    summary:
      'Generate periodic filings for a given year/month (manual trigger)',
  })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @Post('generate')
  async generateFilings(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    return this.filingEngine.generateFilings(y, m);
  }

  @ApiOperation({
    summary:
      'Generate renewal filings from expiring registrations (manual trigger)',
  })
  @Roles('ADMIN')
  @Post('generate-renewals')
  async generateRenewals(@CurrentUser() user: ReqUser) {
    return this.controls.legacyRun('expiry', user.userId || user.id);
  }

  @ApiOperation({ summary: 'Send overdue filing alerts (manual trigger)' })
  @Roles('ADMIN')
  @Post('overdue-alerts')
  async sendOverdueAlerts(@CurrentUser() user: ReqUser) {
    return this.controls.legacyRun('filing_overdue', user.userId || user.id);
  }
}
