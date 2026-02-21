import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { EssService, EssUser } from './ess.service';

// ─── Employee Self-Service Controller ─────────────────────────
// All endpoints require EMPLOYEE role (enforced by global RolesGuard)
@Controller('api/ess')
@Roles('EMPLOYEE')
export class EssController {
  constructor(private readonly svc: EssService) {}

  private user(req: any): EssUser {
    return req.user as EssUser;
  }

  // ── Company Branding (for ESS portal header) ───────────
  @Get('company')
  getCompanyBranding(@Req() req: any) {
    return this.svc.getCompanyBranding(this.user(req));
  }

  // ── Profile ────────────────────────────────────────────
  @Get('profile')
  getProfile(@Req() req: any) {
    return this.svc.getProfile(this.user(req));
  }

  // ── Statutory (PF/ESI details) ─────────────────────────
  @Get('statutory')
  getStatutory(@Req() req: any) {
    return this.svc.getStatutory(this.user(req));
  }

  // ── Contributions (monthly PF/ESI from payroll) ────────
  @Get('contributions')
  getContributions(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getContributions(this.user(req), from, to);
  }

  // ── Nominations ────────────────────────────────────────
  @Get('nominations')
  listNominations(@Req() req: any) {
    return this.svc.listNominations(this.user(req));
  }

  @Post('nominations')
  createNomination(@Req() req: any, @Body() body: any) {
    return this.svc.createNomination(this.user(req), body);
  }

  @Put('nominations/:id/submit')
  submitNomination(@Req() req: any, @Param('id') id: string) {
    return this.svc.submitNomination(this.user(req), id);
  }

  @Put('nominations/:id/resubmit')
  resubmitNomination(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.resubmitNomination(this.user(req), id, body);
  }

  // ── Leave Balances ─────────────────────────────────────
  @Get('leave/balances')
  getLeaveBalances(@Req() req: any, @Query('year') year?: string) {
    return this.svc.getLeaveBalances(this.user(req), year ? parseInt(year) : undefined);
  }

  // ── Leave Policies ─────────────────────────────────────
  @Get('leave/policies')
  getLeavePolicies(@Req() req: any) {
    return this.svc.getLeavePolicies(this.user(req));
  }

  // ── Leave Applications ─────────────────────────────────
  @Get('leave/applications')
  listLeaveApplications(@Req() req: any) {
    return this.svc.listLeaveApplications(this.user(req));
  }

  @Post('leave/apply')
  applyLeave(@Req() req: any, @Body() body: any) {
    return this.svc.applyLeave(this.user(req), body);
  }

  @Put('leave/:id/cancel')
  cancelLeave(@Req() req: any, @Param('id') id: string) {
    return this.svc.cancelLeave(this.user(req), id);
  }

  // ── Payslips ───────────────────────────────────────────
  @Get('payslips')
  listPayslips(@Req() req: any) {
    return this.svc.listPayslips(this.user(req));
  }

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
}

// ─── Branch Approval Controller ───────────────────────────────
// Allows CLIENT (master/branch) users to approve/reject
// nominations and leave requests.
@Controller('api/branch-approvals')
@Roles('CLIENT')
export class BranchApprovalsController {
  constructor(private readonly svc: EssService) {}

  // ── Nominations ────────────────────────────────────────
  @Get('nominations')
  listPendingNominations(
    @Req() req: any,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = req.user?.clientId;
    return this.svc.listPendingNominations(clientId, branchId);
  }

  @Put('nominations/:id/approve')
  approveNomination(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveNomination(id, req.user?.id);
  }

  @Put('nominations/:id/reject')
  rejectNomination(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.rejectNomination(id, req.user?.id, body?.reason);
  }

  // ── Leave Applications ─────────────────────────────────
  @Get('leaves')
  listPendingLeaves(
    @Req() req: any,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = req.user?.clientId;
    return this.svc.listPendingLeaves(clientId, branchId);
  }

  @Put('leaves/:id/approve')
  approveLeave(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveLeave(id, req.user?.id);
  }

  @Put('leaves/:id/reject')
  rejectLeave(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.rejectLeave(id, req.user?.id, body?.reason);
  }
}
