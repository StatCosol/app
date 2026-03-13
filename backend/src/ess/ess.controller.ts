import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { EssService, EssUser } from './ess.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// ─── Employee Self-Service Controller ─────────────────────────
// All endpoints require EMPLOYEE role (enforced by global RolesGuard)
@ApiTags('ESS')
@ApiBearerAuth('JWT')
@Controller({ path: 'ess', version: '1' })
@Roles('EMPLOYEE')
export class EssController {
  constructor(private readonly svc: EssService) {}

  private user(req: any): EssUser {
    return req.user as EssUser;
  }

  // ── Company Branding (for ESS portal header) ───────────
  @ApiOperation({ summary: 'Get Company Branding' })
  @Get('company')
  getCompanyBranding(@Req() req: any) {
    return this.svc.getCompanyBranding(this.user(req));
  }

  // ── Profile ────────────────────────────────────────────
  @ApiOperation({ summary: 'Get Profile' })
  @Get('profile')
  getProfile(@Req() req: any) {
    return this.svc.getProfile(this.user(req));
  }

  @ApiOperation({ summary: 'Update Profile' })
  @Patch('profile')
  updateProfile(@Req() req: any, @Body() body: any) {
    return this.svc.updateProfile(this.user(req), body);
  }

  // ── Statutory (PF/ESI details) ─────────────────────────
  @ApiOperation({ summary: 'Get Statutory' })
  @Get('statutory')
  getStatutory(@Req() req: any) {
    return this.svc.getStatutory(this.user(req));
  }
  @ApiOperation({ summary: 'Get Attendance' })
  @Get('attendance')
  getAttendance(@Req() req: any, @Query('month') month?: string) {
    return this.svc.getAttendance(this.user(req), month);
  }

  @ApiOperation({ summary: 'Get Attendance Summary' })
  @Get('attendance/summary')
  getAttendanceSummary(@Req() req: any, @Query('month') month?: string) {
    return this.svc.getAttendanceSummary(this.user(req), month);
  }

  @ApiOperation({ summary: 'Get Holidays' })
  @Get('holidays')
  getHolidays(@Req() req: any, @Query('month') month?: string) {
    return this.svc.getHolidays(this.user(req), month);
  }

  // ── Contributions (monthly PF/ESI from payroll) ────────
  @ApiOperation({ summary: 'Get Contributions' })
  @Get('contributions')
  getContributions(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getContributions(this.user(req), from, to);
  }

  // ── Nominations ────────────────────────────────────────
  @ApiOperation({ summary: 'List Nominations' })
  @Get('nominations')
  listNominations(@Req() req: any) {
    return this.svc.listNominations(this.user(req));
  }

  @ApiOperation({ summary: 'Create Nomination' })
  @Post('nominations')
  createNomination(@Req() req: any, @Body() body: any) {
    return this.svc.createNomination(this.user(req), body);
  }

  @ApiOperation({ summary: 'Submit Nomination' })
  @Put('nominations/:id/submit')
  submitNomination(@Req() req: any, @Param('id') id: string) {
    return this.svc.submitNomination(this.user(req), id);
  }

  @ApiOperation({ summary: 'Resubmit Nomination' })
  @Put('nominations/:id/resubmit')
  resubmitNomination(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.resubmitNomination(this.user(req), id, body);
  }

  // ── Leave Balances ─────────────────────────────────────
  @ApiOperation({ summary: 'Get Leave Balances' })
  @Get('leave/balances')
  getLeaveBalances(@Req() req: any, @Query('year') year?: string) {
    return this.svc.getLeaveBalances(
      this.user(req),
      year ? parseInt(year) : undefined,
    );
  }

  // ── Leave Policies ─────────────────────────────────────
  @ApiOperation({ summary: 'Get Leave Policies' })
  @Get('leave/policies')
  getLeavePolicies(@Req() req: any) {
    return this.svc.getLeavePolicies(this.user(req));
  }

  // ── Leave Applications ─────────────────────────────────
  @ApiOperation({ summary: 'List Leave Applications' })
  @Get('leave/applications')
  listLeaveApplications(@Req() req: any) {
    return this.svc.listLeaveApplications(this.user(req));
  }

  @ApiOperation({ summary: 'Apply Leave' })
  @Post('leave/apply')
  applyLeave(@Req() req: any, @Body() body: any) {
    return this.svc.applyLeave(this.user(req), body);
  }

  @ApiOperation({ summary: 'Cancel Leave' })
  @Put('leave/:id/cancel')
  cancelLeave(@Req() req: any, @Param('id') id: string) {
    return this.svc.cancelLeave(this.user(req), id);
  }

  // ── Payslips ───────────────────────────────────────────
  @ApiOperation({ summary: 'List Payslips' })
  @Get('payslips')
  listPayslips(@Req() req: any) {
    return this.svc.listPayslips(this.user(req));
  }
  @ApiOperation({ summary: 'Download Payslip' })
  @Get('payslips/:id/download')
  async downloadPayslip(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const result = await this.svc.getPayslipForDownload(this.user(req), id);
    res.set({
      'Content-Type': result.fileType || 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Content-Length': result.fileSize,
    });
    return new StreamableFile(result.stream);
  }
  @ApiOperation({ summary: 'List Documents' })
  @Get('documents')
  listDocuments(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('year') year?: string,
    @Query('q') q?: string,
  ) {
    return this.svc.listDocuments(this.user(req), {
      category,
      year: year ? parseInt(year, 10) : undefined,
      q,
    });
  }

  @ApiOperation({ summary: 'Get Document' })
  @Get('documents/:id')
  getDocument(@Req() req: any, @Param('id') id: string) {
    return this.svc.getDocumentById(this.user(req), id);
  }

  @ApiOperation({ summary: 'Download Document' })
  @Get('documents/:id/download')
  async downloadDocument(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const result = await this.svc.getDocumentForDownload(this.user(req), id);
    res.set({
      'Content-Type': result.fileType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Content-Length': result.fileSize,
    });
    return new StreamableFile(result.stream);
  }
}

// ─── Branch Approval Controller ───────────────────────────────
// Allows CLIENT (master/branch) users to approve/reject
// nominations and leave requests.
@Controller({ path: 'branch-approvals', version: '1' })
@Roles('CLIENT')
export class BranchApprovalsController {
  constructor(
    private readonly svc: EssService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // ── Nominations ────────────────────────────────────────
  @ApiOperation({ summary: 'List Pending Nominations' })
  @Get('nominations')
  async listPendingNominations(
    @Req() req: any,
    @Query('branchId') branchId?: string,
  ) {
    if (branchId) {
      await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    }
    const clientId = req.user?.clientId;
    return this.svc.listPendingNominations(clientId, branchId);
  }

  @ApiOperation({ summary: 'Approve Nomination' })
  @Put('nominations/:id/approve')
  approveNomination(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveNomination(id, req.user?.id);
  }

  @ApiOperation({ summary: 'Reject Nomination' })
  @Put('nominations/:id/reject')
  rejectNomination(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.rejectNomination(id, req.user?.id, body?.reason);
  }

  // ── Leave Applications ─────────────────────────────────
  @ApiOperation({ summary: 'List Pending Leaves' })
  @Get('leaves')
  async listPendingLeaves(
    @Req() req: any,
    @Query('branchId') branchId?: string,
  ) {
    if (branchId) {
      await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    }
    const clientId = req.user?.clientId;
    return this.svc.listPendingLeaves(clientId, branchId);
  }

  @ApiOperation({ summary: 'Approve Leave' })
  @Put('leaves/:id/approve')
  approveLeave(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveLeave(id, req.user?.id);
  }

  @ApiOperation({ summary: 'Reject Leave' })
  @Put('leaves/:id/reject')
  rejectLeave(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.rejectLeave(id, req.user?.id, body?.reason);
  }
}

@Controller({ path: 'client/approvals', version: '1' })
@Roles('CLIENT')
export class ClientApprovalsController {
  constructor(
    private readonly svc: EssService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private actorUserId(req: any): string {
    return req.user?.userId || req.user?.id;
  }

  private normalizeType(
    raw?: string | null,
  ): 'LEAVE' | 'NOMINATION' | undefined {
    const value = String(raw || '').trim().toUpperCase();
    if (!value) return undefined;
    if (value === 'LEAVE') return 'LEAVE';
    if (value === 'NOMINATION') return 'NOMINATION';
    throw new BadRequestException('type must be LEAVE or NOMINATION');
  }

  @ApiOperation({
    summary: 'List unified client approvals (leaves + nominations)',
  })
  @Get()
  async list(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('type') type?: string,
  ) {
    if (branchId) {
      await this.branchAccess.assertBranchAccess(this.actorUserId(req), branchId);
    }
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.listClientApprovals(
      clientId,
      branchId,
      this.normalizeType(type),
    );
  }

  @ApiOperation({ summary: 'Get unified approval detail' })
  @Get(':id')
  async getOne(
    @Req() req: any,
    @Param('id') id: string,
    @Query('type') type?: string,
  ) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const item = await this.svc.getClientApprovalById(
      clientId,
      id,
      this.normalizeType(type),
    );
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(this.actorUserId(req), item.branchId);
    }
    return item;
  }

  @ApiOperation({ summary: 'Get unified approval history' })
  @Get(':id/history')
  async history(
    @Req() req: any,
    @Param('id') id: string,
    @Query('type') type?: string,
  ) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const item = await this.svc.getClientApprovalById(
      clientId,
      id,
      this.normalizeType(type),
    );
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(this.actorUserId(req), item.branchId);
    }
    return this.svc.getClientApprovalHistory(
      clientId,
      id,
      this.normalizeType(type),
    );
  }

  @ApiOperation({ summary: 'Approve unified approval item' })
  @Post(':id/approve')
  async approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @Query('type') queryType?: string,
  ) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const type = this.normalizeType(queryType || body?.type);
    const item = await this.svc.getClientApprovalById(clientId, id, type);
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(this.actorUserId(req), item.branchId);
    }
    return this.svc.approveClientApproval(clientId, id, req.user?.id, type);
  }

  @ApiOperation({ summary: 'Reject unified approval item' })
  @Post(':id/reject')
  async reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @Query('type') queryType?: string,
  ) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const type = this.normalizeType(queryType || body?.type);
    const item = await this.svc.getClientApprovalById(clientId, id, type);
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(this.actorUserId(req), item.branchId);
    }
    return this.svc.rejectClientApproval(
      clientId,
      id,
      req.user?.id,
      body?.reason,
      type,
    );
  }
}

// ─── Leave Policy Management Controller ───────────────────────
// Allows CLIENT (master) users to manage leave policies and
// initialize leave balances for their employees.
@Controller({ path: 'leave-management', version: '1' })
@Roles('CLIENT')
export class LeaveManagementController {
  constructor(private readonly svc: EssService) {}

  @ApiOperation({ summary: 'List Policies' })
  @Get('policies')
  listPolicies(@Req() req: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.listClientLeavePolicies(clientId);
  }

  @ApiOperation({ summary: 'Create Policy' })
  @Post('policies')
  createPolicy(@Req() req: any, @Body() body: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.createLeavePolicy(clientId, body);
  }

  @ApiOperation({ summary: 'Update Policy' })
  @Put('policies/:id')
  updatePolicy(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.updateLeavePolicy(clientId, id, body);
  }

  @ApiOperation({ summary: 'Seed Defaults' })
  @Post('seed-defaults')
  @Roles('ADMIN', 'CLIENT')
  seedDefaults(@Req() req: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.seedDefaultLeavePolicies(clientId);
  }

  @ApiOperation({ summary: 'Initialize Balances' })
  @Post('initialize-balances')
  @Roles('ADMIN', 'CLIENT')
  initializeBalances(@Req() req: any, @Body() body: { year?: number }) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const year = body.year || new Date().getFullYear();
    return this.svc.initializeLeaveBalances(clientId, year);
  }
}



