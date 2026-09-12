import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { LegitxComplianceStatusService } from './legitx-compliance-status.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ComplianceStatusQueryDto } from './dto/compliance-status-query.dto';
import { LegitxScopeService } from './legitx-scope.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH_DESK', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'ADMIN')
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx/compliance-status', version: '1' })
export class LegitxComplianceStatusController {
  constructor(
    private readonly svc: LegitxComplianceStatusService,
    private readonly scopeService: LegitxScopeService,
  ) {}

  /** Overall compliance summary with KPIs and risk level */
  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  async summary(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getSummary(await this.buildParams(user, q));
  }

  /** Consolidated monthly dashboard across tasks, returns, registrations and audits */
  @ApiOperation({ summary: 'Monthly compliance dashboard overview' })
  @Get('overview')
  async overview(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getOverview(await this.buildParams(user, q));
  }

  /** Branch-wise compliance breakdown table */
  @ApiOperation({ summary: 'Branches' })
  @Get('branches')
  async branches(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getBranches(await this.buildParams(user, q));
  }

  /** Tasks drill-down (filterable by category / law family) */
  @ApiOperation({ summary: 'Tasks' })
  @Get('tasks')
  async tasks(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getTasks({
      ...(await this.buildParams(user, q)),
      category: q.category ?? null,
    });
  }

  /** Contractor compliance impact (document upload %) */
  @ApiOperation({ summary: 'Contractors' })
  @Get('contractors')
  async contractors(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getContractorImpact(await this.buildParams(user, q));
  }

  /** Audit findings and their impact on compliance */
  @ApiOperation({ summary: 'Audit' })
  @Get('audit')
  async audit(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getAuditImpact(await this.buildParams(user, q));
  }

  /** Returns / filings status for the period */
  @ApiOperation({ summary: 'Returns' })
  @Get('returns')
  async returns(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceStatusQueryDto,
  ) {
    return this.svc.getReturnsStatus(await this.buildParams(user, q));
  }

  private async buildParams(user: ReqUser, q: ComplianceStatusQueryDto) {
    const now = new Date();

    const normalizedMonth = q.month ?? now.getMonth() + 1;
    const normalizedYear = q.year ?? now.getFullYear();
    const normalizedLimit = this.clamp(q.limit, 0, 500, 200);
    const normalizedOffset = this.clamp(
      q.offset,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    );

    const scope = await this.scopeService.resolve(user, q);

    return {
      month: normalizedMonth,
      year: normalizedYear,
      ...scope,
      status: q.status ?? null,
      limit: normalizedLimit,
      offset: normalizedOffset,
    };
  }

  private clamp(
    value: number | undefined,
    min: number,
    max: number,
    fallback: number,
  ) {
    if (value === undefined || value === null || Number.isNaN(value))
      return fallback;
    return Math.min(Math.max(value, min), max);
  }
}
