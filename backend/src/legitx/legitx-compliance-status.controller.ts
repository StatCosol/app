import {
  Controller,
  ForbiddenException,
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
import { BranchAccessService } from '../auth/branch-access.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'ADMIN')
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx/compliance-status', version: '1' })
export class LegitxComplianceStatusController {
  constructor(
    private readonly svc: LegitxComplianceStatusService,
    private readonly branchAccess: BranchAccessService,
    @InjectDataSource() private readonly dataSource: DataSource,
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

    // Branch users can only see their own branch (if branchId is known on token)
    const branchId =
      user.userType === 'BRANCH' && user.branchIds?.[0]
        ? user.branchIds[0]
        : (q.branchId ?? null);

    // Enforce branch scoping for CLIENT users
    let allowedBranchIds: string[] | 'ALL' = 'ALL';
    let resolvedClientId: string | null = user.clientId ?? null;
    if (user.clientId) {
      allowedBranchIds = await this.branchAccess.getAllowedBranchIds(
        user.userId,
        user.clientId,
      );
      if (
        branchId &&
        allowedBranchIds !== 'ALL' &&
        !allowedBranchIds.includes(branchId)
      ) {
        throw new ForbiddenException('You do not have access to this branch');
      }
      if (
        !branchId &&
        allowedBranchIds !== 'ALL' &&
        allowedBranchIds.length === 1
      ) {
        // Auto-scope single-branch users
        q.branchId = allowedBranchIds[0];
      }
    } else if (branchId) {
      // Staff role with no tenant context (CEO/CCO/CRM/AUDITOR/ADMIN) but
      // a specific branchId was requested. Derive that branch's clientId
      // and constrain the query to it; otherwise the downstream task /
      // audit-observation queries filter on branch_id alone, which works
      // correctly when branchId is set, but the SQL `clientId = $1` guard
      // gets a NULL and silently aggregates across all clients on the
      // few queries that fall back to clientId-only filtering.
      const rows: Array<{ clientid: string }> = await this.dataSource.query(
        `SELECT clientid FROM client_branches WHERE id = $1 LIMIT 1`,
        [branchId],
      );
      if (!rows.length) {
        throw new ForbiddenException('Branch not found');
      }
      resolvedClientId = rows[0].clientid;
    }

    return {
      month: normalizedMonth,
      year: normalizedYear,
      branchId: q.branchId ?? branchId,
      clientId: resolvedClientId,
      allowedBranchIds,
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
