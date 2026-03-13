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
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorService } from './contractor.service';
import { ContractorDashboardService } from './contractor-dashboard.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
  ) {}

  @ApiOperation({ summary: 'Get Dashboard' })
  @Get('dashboard')
  getDashboard(@Req() req: any) {
    const userId = req.user?.userId;
    return this.service.getDashboard(userId);
  }

  @ApiOperation({ summary: 'Legacy Contractor Profile (compat)' })
  @Get('profile')
  async getLegacyProfile(@Req() req: any) {
    const userId = req.user?.userId;
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
      branchCount: Array.isArray(profile.branches) ? profile.branches.length : 0,
      data: profile,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Branches (compat)' })
  @Get('branches')
  async getLegacyBranches(@Req() req: any) {
    const userId = req.user?.userId;
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
  async getLegacyTasks(@Req() req: any, @Query() q: any) {
    const wantsOpen = String(q?.status || '').toUpperCase() === 'OPEN';
    const normalizedQuery = { ...(q || {}) };
    if (wantsOpen) delete normalizedQuery.status;

    const result = await this.complianceService.contractorListTasks(
      req.user,
      normalizedQuery,
    );

    const rows = Array.isArray(result?.data) ? result.data : [];
    const filteredRows = wantsOpen
      ? rows.filter((row: any) => this.isOpenTaskStatus(row?.status))
      : rows;

    return {
      data: filteredRows,
      total: filteredRows.length,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Task Summary (compat)' })
  @Get('tasks/summary')
  async getLegacyTaskSummary(@Req() req: any, @Query() q: any) {
    const result = await this.complianceService.contractorListTasks(req.user, q);
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
  async getLegacyOverdueTasks(@Req() req: any, @Query() q: any) {
    const result = await this.complianceService.contractorListTasks(req.user, q);
    const rows = Array.isArray(result?.data) ? result.data : [];
    const overdue = rows.filter(
      (row: any) => String(row?.status || '').toUpperCase() === 'OVERDUE',
    );

    return {
      data: overdue,
      total: overdue.length,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Rejected Tasks (compat)' })
  @Get('tasks/rejected')
  async getLegacyRejectedTasks(@Req() req: any, @Query() q: any) {
    const result = await this.complianceService.contractorListTasks(req.user, q);
    const rows = Array.isArray(result?.data) ? result.data : [];
    const rejected = rows.filter(
      (row: any) => String(row?.status || '').toUpperCase() === 'REJECTED',
    );

    return {
      data: rejected,
      total: rejected.length,
    };
  }

  @ApiOperation({ summary: 'Legacy Contractor Task Detail (compat)' })
  @Get('tasks/:id')
  getLegacyTaskDetail(@Req() req: any, @Param('id') id: string) {
    return this.complianceService.contractorGetTaskDetail(req.user, id);
  }

  /**
   * GET /api/v1/contractor/score-trend?from=YYYY-MM&to=YYYY-MM
   * Returns monthly score trend for the logged-in contractor.
   */
  @ApiOperation({ summary: 'Get Score Trend' })
  @Get('score-trend')
  async getScoreTrend(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = req.user?.userId;
    const user = await this.service.getContractorProfile(userId);
    return this.dashboardService.contractorTrend(
      user.clientId,
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
    @Req() req: any,
    @Param('contractorId') contractorId: string,
  ) {
    const userId = req.user?.userId;
    return this.service.getContractorBranchesForCrm(userId, contractorId);
  }

  @ApiOperation({ summary: 'Set Contractor Branches' })
  @Put(':contractorId/branches')
  setContractorBranches(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Body() dto: { branchIds: string[] },
  ) {
    const userId = req.user?.userId;
    return this.service.setContractorBranchesForCrm(
      userId,
      contractorId,
      dto.branchIds,
    );
  }

  @ApiOperation({ summary: 'Add Contractor Branches' })
  @Post(':contractorId/branches')
  addContractorBranches(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Body() dto: { branchIds: string[] },
  ) {
    const userId = req.user?.userId;
    return this.service.addContractorBranchesForCrm(
      userId,
      contractorId,
      dto.branchIds,
    );
  }

  @ApiOperation({ summary: 'Remove Contractor Branch' })
  @Delete(':contractorId/branches/:branchId')
  removeContractorBranch(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Param('branchId') branchId: string,
  ) {
    const userId = req.user?.userId;
    return this.service.removeContractorBranchForCrm(
      userId,
      contractorId,
      branchId,
    );
  }
}
