import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ExpiryTaskService } from '../services/expiry-task.service';
import { BranchAccessService } from '../../auth/branch-access.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Client – Expiry Tasks')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/expiry-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CLIENT')
export class ClientExpiryController {
  constructor(
    private readonly expiryTaskService: ExpiryTaskService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * A branch user's mapped branches, or null for a master.
   *
   * Branch users reach this controller: their roleCode is CLIENT, and only
   * userType tells them apart, so @Roles('CLIENT') admits them here as well as
   * to /branch/expiry-tasks. Both endpoints below filtered by client alone, so
   * a branch user saw every branch's expiry tasks — and the KPI counted them.
   */
  private async branchScopeOf(user: ReqUser): Promise<string[] | null> {
    if (user.roleCode !== 'CLIENT') return null;
    const branchIds = await this.branchAccess.getUserBranchIds(user.userId);
    // No mappings means a master user, which is how the rest of this codebase
    // reads an empty list for a CLIENT.
    return branchIds.length ? branchIds : null;
  }

  @ApiOperation({ summary: 'List expiry tasks for client' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    const branchIds = await this.branchScopeOf(user);
    // listForBranch returns the same shape as listForClient, so a branch user
    // gets their own rows without the response changing under them.
    return branchIds
      ? this.expiryTaskService.listForBranch(branchIds)
      : this.expiryTaskService.listForClient(user.clientId!);
  }

  @ApiOperation({ summary: 'KPI summary for client expiry tasks' })
  @Get('kpi')
  async kpi(@CurrentUser() user: ReqUser) {
    const branchIds = await this.branchScopeOf(user);
    return this.expiryTaskService.getKpiSummary(
      user.clientId!,
      undefined,
      branchIds ?? undefined,
    );
  }
}
