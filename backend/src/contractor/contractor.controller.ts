import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorService } from './contractor.service';
import { ContractorDashboardService } from './contractor-dashboard.service';
import { ContractorRequiredDocumentsService } from './contractor-required-documents.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Contractor')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorController {
  constructor(
    private readonly service: ContractorService,
    private readonly dashboardService: ContractorDashboardService,
    private readonly complianceService: ComplianceService,
    private readonly requiredDocsSvc: ContractorRequiredDocumentsService,
  ) {}

  @ApiOperation({ summary: 'Get Dashboard' })
  @Get('dashboard')
  getDashboard(@CurrentUser() user: ReqUser) {
    const userId = user?.userId;
    return this.service.getDashboard(userId);
  }

  @ApiOperation({ summary: 'Legacy Contractor Profile (compat)' })
  @Get('profile')
  async getLegacyProfile(@CurrentUser() user: ReqUser) {
    const userId = user?.userId;
    const profile = await this.service.getContractorProfile(userId);
    return {
      id: profile.contractorUserId,
      contractorUserId: profile.contractorUserId,
      clientId: profile.clientId,
      name: profile.contractorName,
      contractorName: profile.contractorName,
      email: profile.email,
      mobile: profile.phone,
      phone: profile.phone,
      branches: profile.branches,
      branchCount: Array.isArray(profile.branches)
        ? profile.branches.length
        : 0,
      data: profile,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Branches (compat)' })
  @Get('branches')
  async getLegacyBranches(@CurrentUser() user: ReqUser) {
    const userId = user?.userId;
    const dashboard = await this.service.getDashboard(userId);
    const branches = Array.isArray(dashboard?.branches)
      ? dashboard.branches
      : [];
    return {
      data: branches,
      branches,
      total: branches.length,
      clientId: dashboard?.clientId ?? null,
      monthSummary: dashboard?.monthSummary ?? null,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Task List (compat)' })
  @Get('tasks')
  async getLegacyTasks(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const wantsOpen = String(q?.status || '').toUpperCase() === 'OPEN';
    const normalizedQuery = { ...(q || {}) };
    if (wantsOpen) delete normalizedQuery.status;

    const result = await this.complianceService.contractorListTasks(
      user,
      normalizedQuery,
    );

    const rows = Array.isArray(result?.data) ? result.data : [];
    const filteredRows = wantsOpen
      ? rows.filter((row: { status?: string }) => this.isOpenTaskStatus(String(row?.status || '')))
      : rows;

    return {
      data: filteredRows,
      total: filteredRows.length,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Task Summary (compat)' })
  @Get('tasks/summary')
  async getLegacyTaskSummary(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const result = await this.complianceService.contractorListTasks(user, q);
    const rows = Array.isArray(result?.data) ? result.data : [];

    const summary = {
      total: rows.length,
      open: 0,
      pending: 0,
      inProgress: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      overdue: 0,
    };

    for (const row of rows) {
      const status = String(row?.status || '').toUpperCase();
      if (status === 'PENDING') summary.pending += 1;
      if (status === 'IN_PROGRESS') summary.inProgress += 1;
      if (status === 'SUBMITTED') summary.submitted += 1;
      if (status === 'APPROVED') summary.approved += 1;
      if (status === 'REJECTED') summary.rejected += 1;
      if (status === 'OVERDUE') summary.overdue += 1;
      if (this.isOpenTaskStatus(status)) summary.open += 1;
    }

    return summary;
  }

  @ApiOperation({ summary: 'Legacy Contractor Overdue Tasks (compat)' })
  @Get('tasks/overdue')
  async getLegacyOverdueTasks(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const result = await this.complianceService.contractorListTasks(user, q);
    const rows = Array.isArray(result?.data) ? result.data : [];
    const overdue = rows.filter(
      (row: { status?: string }) => String(row?.status || '').toUpperCase() === 'OVERDUE',
    );

    return {
      data: overdue,
      total: overdue.length,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Rejected Tasks (compat)' })
  @Get('tasks/rejected')
  async getLegacyRejectedTasks(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const result = await this.complianceService.contractorListTasks(user, q);
    const rows = Array.isArray(result?.data) ? result.data : [];
    const rejected = rows.filter(
      (row: { status?: string }) => String(row?.status || '').toUpperCase() === 'REJECTED',
    );

    return {
      data: rejected,
      total: rejected.length,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Task Detail (compat)' })
  @Get('tasks/:id')
  getLegacyTaskDetail(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.complianceService.contractorGetTaskDetail(user, id);
  }

  /**
   * GET /api/v1/contractor/monthly-checklist?month=YYYY-MM
   * Returns the monthly required-document checklist for the logged-in contractor,
   * with upload status for each required doc type.
   */
  @ApiOperation({ summary: 'Get Monthly Document Checklist' })
  @Get('monthly-checklist')
  async getMonthlyChecklist(
    @CurrentUser() user: ReqUser,
    @Query('month') month?: string,
  ) {
    const userId = user?.userId;
    const profile = await this.service.getContractorProfile(userId);
    return this.requiredDocsSvc.getContractorChecklist(
      userId,
      profile.clientId,
      month,
    );
  }

  /**
   * GET /api/v1/contractor/score-trend?from=YYYY-MM&to=YYYY-MM
   * Returns monthly score trend for the logged-in contractor.
   */
  @ApiOperation({ summary: 'Get Score Trend' })
  @Get('score-trend')
  async getScoreTrend(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = user?.userId;
    const profile = await this.service.getContractorProfile(userId);
    return this.dashboardService.contractorTrend(
      profile.clientId,
      userId,
      from,
      to,
    );
  }

  private isOpenTaskStatus(status: string): boolean {
    const s = String(status || '').toUpperCase();
    return (
      s === 'PENDING' ||
      s === 'IN_PROGRESS' ||
      s === 'REJECTED' ||
      s === 'OVERDUE'
    );
  }
}

@Controller({ path: 'admin/contractors', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminContractorsController {
  constructor(private readonly service: ContractorService) {}

  @ApiOperation({ summary: 'List Links' })
  @Get('links')
  listLinks() {
    return this.service.listContractorLinks();
  }
}

@Controller({ path: 'crm/contractors', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmContractorsController {
  constructor(private readonly service: ContractorService) {}

  @ApiOperation({ summary: 'Get Contractor Branches' })
  @Get(':contractorId/branches')
  getContractorBranches(
    @CurrentUser() user: ReqUser,
    @Param('contractorId') contractorId: string,
  ) {
    const userId = user?.userId;
    return this.service.getContractorBranchesForCrm(userId, contractorId);
  }

  @ApiOperation({ summary: 'Set Contractor Branches' })
  @Put(':contractorId/branches')
  setContractorBranches(
    @CurrentUser() user: ReqUser,
    @Param('contractorId') contractorId: string,
    @Body() dto: { branchIds: string[] },
  ) {
    const userId = user?.userId;
    return this.service.setContractorBranchesForCrm(
      userId,
      contractorId,
      dto.branchIds,
    );
  }

  @ApiOperation({ summary: 'Add Contractor Branches' })
  @Post(':contractorId/branches')
  addContractorBranches(
    @CurrentUser() user: ReqUser,
    @Param('contractorId') contractorId: string,
    @Body() dto: { branchIds: string[] },
  ) {
    const userId = user?.userId;
    return this.service.addContractorBranchesForCrm(
      userId,
      contractorId,
      dto.branchIds,
    );
  }

  @ApiOperation({ summary: 'Remove Contractor Branch' })
  @Delete(':contractorId/branches/:branchId')
  removeContractorBranch(
    @CurrentUser() user: ReqUser,
    @Param('contractorId') contractorId: string,
    @Param('branchId') branchId: string,
  ) {
    const userId = user?.userId;
    return this.service.removeContractorBranchForCrm(
      userId,
      contractorId,
      branchId,
    );
  }
}
