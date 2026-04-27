import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { EssService } from './ess.service';
import {
  UpdateEssProfileDto,
  EssCheckInDto,
  EssCheckOutDto,
  SubmitShortWorkReasonDto,
  CreateEssNominationDto,
  ResubmitNominationDto,
  UpdateEssNominationDto,
  ApplyLeaveDto,
  CreateLeavePolicyDto,
  UpdateLeavePolicyDto,
  RejectReasonDto,
} from './dto/ess.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { EmployeeAppraisalsService } from '../performance-appraisal/services/employee-appraisals.service';

// ─── Employee Self-Service Controller ─────────────────────────
// All endpoints require EMPLOYEE role (enforced by global RolesGuard)
@ApiTags('ESS')
@ApiBearerAuth('JWT')
@Controller({ path: 'ess', version: '1' })
@Roles('EMPLOYEE')
export class EssController {
  constructor(
    private readonly svc: EssService,
    private readonly appraisalSvc: EmployeeAppraisalsService,
  ) {}

  // ── Company Branding (for ESS portal header) ───────────
  @ApiOperation({ summary: 'Get Company Branding' })
  @Get('company')
  getCompanyBranding(@CurrentUser() user: ReqUser) {
    return this.svc.getCompanyBranding(user);
  }

  // ── Profile ────────────────────────────────────────────
  @ApiOperation({ summary: 'Get Profile' })
  @Get('profile')
  getProfile(@CurrentUser() user: ReqUser) {
    return this.svc.getProfile(user);
  }

  @ApiOperation({ summary: 'Update Profile' })
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: ReqUser,
    @Body() body: UpdateEssProfileDto,
  ) {
    return this.svc.updateProfile(user, body);
  }

  // ── Statutory (PF/ESI details) ─────────────────────────
  @ApiOperation({ summary: 'Get Statutory' })
  @Get('statutory')
  getStatutory(@CurrentUser() user: ReqUser) {
    return this.svc.getStatutory(user);
  }
  @ApiOperation({ summary: 'Get Attendance' })
  @Get('attendance')
  getAttendance(@CurrentUser() user: ReqUser, @Query('month') month?: string) {
    return this.svc.getAttendance(user, month);
  }

  @ApiOperation({ summary: 'Get Attendance Summary' })
  @Get('attendance/summary')
  getAttendanceSummary(
    @CurrentUser() user: ReqUser,
    @Query('month') month?: string,
  ) {
    return this.svc.getAttendanceSummary(user, month);
  }

  @ApiOperation({ summary: 'Get Today Attendance Status' })
  @Get('attendance/today')
  getTodayStatus(@CurrentUser() user: ReqUser) {
    return this.svc.getTodayAttendance(user);
  }

  @ApiOperation({ summary: 'Employee Check-In' })
  @Post('attendance/check-in')
  checkIn(@CurrentUser() user: ReqUser, @Body() body: EssCheckInDto) {
    return this.svc.selfCheckIn(user, body);
  }

  @ApiOperation({ summary: 'Employee Check-Out' })
  @Post('attendance/check-out')
  checkOut(@CurrentUser() user: ReqUser, @Body() body: EssCheckOutDto) {
    return this.svc.selfCheckOut(user, body);
  }

  @ApiOperation({ summary: 'Submit Short Work Reason' })
  @Post('attendance/short-reason')
  submitShortWorkReason(
    @CurrentUser() user: ReqUser,
    @Body() body: SubmitShortWorkReasonDto,
  ) {
    return this.svc.submitShortWorkReason(user, body);
  }

  @ApiOperation({ summary: 'Get Overtime Summary' })
  @Get('attendance/overtime-summary')
  getOvertimeSummary(
    @CurrentUser() user: ReqUser,
    @Query('month') month?: string,
  ) {
    return this.svc.getOvertimeSummary(user, month);
  }

  @ApiOperation({ summary: 'Get Comp-Off Balance' })
  @Get('attendance/comp-off/balance')
  getCompOffBalance(@CurrentUser() user: ReqUser) {
    return this.svc.getCompOffBalance(user);
  }

  @ApiOperation({ summary: 'Get Comp-Off Ledger' })
  @Get('attendance/comp-off/ledger')
  getCompOffLedger(@CurrentUser() user: ReqUser) {
    return this.svc.getCompOffLedger(user);
  }

  @ApiOperation({ summary: 'Get Holidays' })
  @Get('holidays')
  getHolidays(@CurrentUser() user: ReqUser, @Query('month') month?: string) {
    return this.svc.getHolidays(user, month);
  }

  // ── Contributions (monthly PF/ESI from payroll) ────────
  @ApiOperation({ summary: 'Get Contributions' })
  @Get('contributions')
  getContributions(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getContributions(user, from, to);
  }

  // ── Nominations ────────────────────────────────────────
  @ApiOperation({ summary: 'List Nominations' })
  @Get('nominations')
  listNominations(@CurrentUser() user: ReqUser) {
    return this.svc.listNominations(user);
  }

  @ApiOperation({ summary: 'Create Nomination' })
  @Post('nominations')
  createNomination(
    @CurrentUser() user: ReqUser,
    @Body() body: CreateEssNominationDto,
  ) {
    return this.svc.createNomination(user, body);
  }

  @ApiOperation({ summary: 'Submit Nomination' })
  @Put('nominations/:id/submit')
  submitNomination(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.submitNomination(user, id);
  }

  @ApiOperation({ summary: 'Resubmit Nomination' })
  @Put('nominations/:id/resubmit')
  resubmitNomination(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: ResubmitNominationDto,
  ) {
    return this.svc.resubmitNomination(user, id, body);
  }

  @ApiOperation({ summary: 'Update Nomination (DRAFT or APPROVED)' })
  @Put('nominations/:id')
  updateNomination(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateEssNominationDto,
  ) {
    return this.svc.updateNomination(user, id, body);
  }

  // ── Leave Balances ─────────────────────────────────────
  @ApiOperation({ summary: 'Get Leave Balances' })
  @Get('leave/balances')
  getLeaveBalances(@CurrentUser() user: ReqUser, @Query('year') year?: string) {
    return this.svc.getLeaveBalances(user, year ? parseInt(year) : undefined);
  }

  // ── Leave Policies ─────────────────────────────────────
  @ApiOperation({ summary: 'Get Leave Policies' })
  @Get('leave/policies')
  getLeavePolicies(@CurrentUser() user: ReqUser) {
    return this.svc.getLeavePolicies(user);
  }

  // ── Leave Applications ─────────────────────────────────
  @ApiOperation({ summary: 'List Leave Applications' })
  @Get('leave/applications')
  listLeaveApplications(@CurrentUser() user: ReqUser) {
    return this.svc.listLeaveApplications(user);
  }

  @ApiOperation({ summary: 'Apply Leave' })
  @Post('leave/apply')
  applyLeave(@CurrentUser() user: ReqUser, @Body() body: ApplyLeaveDto) {
    return this.svc.applyLeave(user, body);
  }

  @ApiOperation({ summary: 'Cancel Leave' })
  @Put('leave/:id/cancel')
  cancelLeave(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.cancelLeave(user, id);
  }

  // ── Payslips ───────────────────────────────────────────
  @ApiOperation({ summary: 'List Payslips' })
  @Get('payslips')
  listPayslips(@CurrentUser() user: ReqUser) {
    return this.svc.listPayslips(user);
  }
  @ApiOperation({ summary: 'Download Payslip' })
  @Get('payslips/:id/download')
  async downloadPayslip(
    @CurrentUser() user: ReqUser,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const result = await this.svc.getPayslipForDownload(user, id);
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
    @CurrentUser() user: ReqUser,
    @Query('category') category?: string,
    @Query('year') year?: string,
    @Query('q') q?: string,
  ) {
    return this.svc.listDocuments(user, {
      category,
      year: year ? parseInt(year, 10) : undefined,
      q,
    });
  }

  @ApiOperation({ summary: 'Upload Document (self)' })
  @Post('documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'employee-documents');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @CurrentUser() user: ReqUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
    @Body('docName') docName: string,
    @Body('expiryDate') expiryDate?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!docType) throw new BadRequestException('docType is required');
    return this.svc.uploadSelfDocument(user, {
      docType,
      docName: docName || file.originalname,
      fileName: file.filename,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      expiryDate: expiryDate || undefined,
    });
  }

  @ApiOperation({ summary: 'Get Document' })
  @Get('documents/:id')
  getDocument(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.getDocumentById(user, id);
  }

  @ApiOperation({ summary: 'Download Document' })
  @Get('documents/:id/download')
  async downloadDocument(
    @CurrentUser() user: ReqUser,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const result = await this.svc.getDocumentForDownload(user, id);
    res.set({
      'Content-Type': result.fileType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Content-Length': result.fileSize,
    });
    return new StreamableFile(result.stream);
  }

  // ── Performance Appraisal (Self-Service) ───────────────
  @ApiOperation({ summary: 'List my appraisals' })
  @Get('appraisals')
  getMyAppraisals(@CurrentUser() user: ReqUser) {
    if (!user.employeeId) throw new BadRequestException('No employee record linked');
    return this.appraisalSvc.findByEmployee(user.employeeId);
  }

  @ApiOperation({ summary: 'Get my appraisal detail' })
  @Get('appraisals/:id')
  getMyAppraisal(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!user.employeeId) throw new BadRequestException('No employee record linked');
    return this.appraisalSvc.findOne(id);
  }

  @ApiOperation({ summary: 'Submit self-review ratings' })
  @Post('appraisals/:id/self-review')
  submitSelfReview(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { items: { itemId: string; rating: number; remarks?: string }[] },
  ) {
    if (!user.employeeId) throw new BadRequestException('No employee record linked');
    return this.appraisalSvc.selfReview(id, body.items, user.employeeId);
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
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    if (branchId) {
      await this.branchAccess.assertBranchAccess(user.userId, branchId);
    }
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.listPendingNominations(clientId, branchId);
  }

  @ApiOperation({ summary: 'Approve Nomination' })
  @Put('nominations/:id/approve')
  approveNomination(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.approveNomination(id, user?.id);
  }

  @ApiOperation({ summary: 'Reject Nomination' })
  @Put('nominations/:id/reject')
  rejectNomination(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: RejectReasonDto,
  ) {
    return this.svc.rejectNomination(id, user?.id, body?.reason);
  }

  // ── Leave Applications ─────────────────────────────────
  @ApiOperation({ summary: 'List Pending Leaves' })
  @Get('leaves')
  async listPendingLeaves(
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    if (branchId) {
      await this.branchAccess.assertBranchAccess(user.userId, branchId);
    }
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.listPendingLeaves(clientId, branchId);
  }

  @ApiOperation({ summary: 'Approve Leave' })
  @Put('leaves/:id/approve')
  approveLeave(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.approveLeave(id, user?.id);
  }

  @ApiOperation({ summary: 'Reject Leave' })
  @Put('leaves/:id/reject')
  rejectLeave(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: RejectReasonDto,
  ) {
    return this.svc.rejectLeave(id, user?.id, body?.reason);
  }
}

@Controller({ path: 'client/approvals', version: '1' })
@Roles('CLIENT')
export class ClientApprovalsController {
  constructor(
    private readonly svc: EssService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private actorUserId(user: ReqUser): string {
    return user?.userId || user?.id;
  }

  private normalizeType(
    raw?: string | null,
  ): 'LEAVE' | 'NOMINATION' | undefined {
    const value = String(raw || '')
      .trim()
      .toUpperCase();
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
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
    @Query('type') type?: string,
  ) {
    if (branchId) {
      await this.branchAccess.assertBranchAccess(
        this.actorUserId(user),
        branchId,
      );
    }
    const clientId = user?.clientId;
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
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Query('type') type?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const item = await this.svc.getClientApprovalById(
      clientId,
      id,
      this.normalizeType(type),
    );
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(
        this.actorUserId(user),
        item.branchId,
      );
    }
    return item;
  }

  @ApiOperation({ summary: 'Get unified approval history' })
  @Get(':id/history')
  async history(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Query('type') type?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const item = await this.svc.getClientApprovalById(
      clientId,
      id,
      this.normalizeType(type),
    );
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(
        this.actorUserId(user),
        item.branchId,
      );
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
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: RejectReasonDto,
    @Query('type') queryType?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const type = this.normalizeType(queryType || body?.type);
    const item = await this.svc.getClientApprovalById(clientId, id, type);
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(
        this.actorUserId(user),
        item.branchId,
      );
    }
    return this.svc.approveClientApproval(clientId, id, user?.id, type);
  }

  @ApiOperation({ summary: 'Reject unified approval item' })
  @Post(':id/reject')
  async reject(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: RejectReasonDto,
    @Query('type') queryType?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const type = this.normalizeType(queryType || body?.type);
    const item = await this.svc.getClientApprovalById(clientId, id, type);
    if (item.branchId) {
      await this.branchAccess.assertBranchAccess(
        this.actorUserId(user),
        item.branchId,
      );
    }
    return this.svc.rejectClientApproval(
      clientId,
      id,
      user?.id,
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
  listPolicies(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.listClientLeavePolicies(clientId);
  }

  @ApiOperation({ summary: 'Create Policy' })
  @Post('policies')
  createPolicy(
    @CurrentUser() user: ReqUser,
    @Body() body: CreateLeavePolicyDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.createLeavePolicy(clientId, body);
  }

  @ApiOperation({ summary: 'Update Policy' })
  @Put('policies/:id')
  updatePolicy(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateLeavePolicyDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.updateLeavePolicy(clientId, id, body);
  }

  @ApiOperation({ summary: 'Seed Defaults' })
  @Post('seed-defaults')
  @Roles('ADMIN', 'CLIENT')
  seedDefaults(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.seedDefaultLeavePolicies(clientId);
  }

  @ApiOperation({ summary: 'Initialize Balances' })
  @Post('initialize-balances')
  @Roles('ADMIN', 'CLIENT')
  initializeBalances(
    @CurrentUser() user: ReqUser,
    @Body() body: { year?: number },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const year = body.year || new Date().getFullYear();
    return this.svc.initializeLeaveBalances(clientId, year);
  }

  @ApiOperation({ summary: 'Accrue Monthly Earned Leave' })
  @Post('accrue-el')
  @Roles('ADMIN', 'CLIENT')
  accrueEL(
    @CurrentUser() user: ReqUser,
    @Body() body: { year?: number; month?: number },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const now = new Date();
    const year = body.year || now.getFullYear();
    const month = body.month || now.getMonth() + 1;
    return this.svc.accrueMonthlyEL(clientId, year, month);
  }
}
