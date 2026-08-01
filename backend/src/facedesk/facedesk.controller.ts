import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { FaceDeskAdminService } from './facedesk-admin.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { FaceDeskDashboardService } from './facedesk-dashboard.service';
import {
  FaceDeskReportsService,
  ReportRange,
} from './facedesk-reports.service';
import { FaceDeskDeviceService } from './facedesk-device.service';
import { FaceDeskTicketService } from './facedesk-ticket.service';
import {
  CheckDuplicateDto,
  CreateEnrollTicketDto,
  DuplicateActionDto,
  ManualCorrectionDto,
  MarkAttendanceDto,
  OfflineSyncDto,
  ReviewActionDto,
  SaveEnrollmentDto,
  SetAttendancePinDto,
  UpdateSettingsDto,
  ValidateQualityDto,
} from './facedesk.dto';

/**
 * FaceDesk V2 API. Admin/enrollment/review endpoints are role-guarded via the
 * global JWT + Roles guards. Kiosk device-token auth for the attendance
 * endpoints lands in Phase 5 alongside the kiosk app; for now attendance is
 * reachable by CLIENT/ADMIN so the portal can drive and validate the flow.
 */
@ApiTags('FaceDesk V2')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk', version: '1' })
export class FaceDeskController {
  constructor(
    private readonly enrollment: FaceDeskEnrollmentService,
    private readonly attendance: FaceDeskAttendanceService,
    private readonly admin: FaceDeskAdminService,
    private readonly settings: FaceDeskSettingsService,
    private readonly dashboard: FaceDeskDashboardService,
    private readonly reports: FaceDeskReportsService,
    private readonly devices: FaceDeskDeviceService,
    private readonly tickets: FaceDeskTicketService,
  ) {}

  private range(user: ReqUser, from?: string, to?: string): ReportRange {
    return { from, to, branchIds: this.branchScope(user) ?? undefined };
  }

  private branchScope(user: ReqUser): string[] | null {
    return user?.roleCode === 'CLIENT' && user?.userType === 'BRANCH'
      ? (user.branchIds ?? [])
      : null;
  }

  private requireClient(user: ReqUser): string {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return clientId;
  }

  private requireClientAdmin(user: ReqUser): string {
    if (this.branchScope(user) !== null) {
      throw new ForbiddenException('Client administrator access required');
    }
    return this.requireClient(user);
  }

  // ── Enrollment ────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Pending employees for enrollment' })
  @Get('enrollment/pending')
  @Roles('CLIENT', 'ADMIN')
  pending(
    @CurrentUser() user: ReqUser,
    @Query('subjectType') subjectType?: string,
  ) {
    return this.enrollment.getPendingEmployees(
      this.requireClient(user),
      this.branchScope(user) ?? [],
      subjectType === 'CONTRACTOR' ? 'CONTRACTOR' : 'EMPLOYEE',
    );
  }

  @ApiOperation({ summary: 'Enrolled FaceDesk subjects and profile details' })
  @Get('enrollment/enrolled')
  @Roles('CLIENT', 'ADMIN')
  enrolled(
    @CurrentUser() user: ReqUser,
    @Query('subjectType') subjectType?: string,
  ) {
    return this.enrollment.getEnrolledEmployees(
      this.requireClient(user),
      this.branchScope(user),
      subjectType === 'CONTRACTOR' ? 'CONTRACTOR' : 'EMPLOYEE',
    );
  }

  @ApiOperation({ summary: 'Validate captured face quality' })
  @Post('enrollment/validate-quality')
  @Roles('CLIENT', 'ADMIN')
  validateQuality(
    @CurrentUser() user: ReqUser,
    @Body() dto: ValidateQualityDto,
  ) {
    this.requireClient(user);
    return this.enrollment.validateQuality(dto);
  }

  @ApiOperation({ summary: 'Check duplicate face before saving' })
  @Post('enrollment/check-duplicate')
  @Roles('CLIENT', 'ADMIN')
  checkDuplicate(@CurrentUser() user: ReqUser, @Body() dto: CheckDuplicateDto) {
    return this.enrollment.checkDuplicate(this.requireClient(user), dto);
  }

  @ApiOperation({ summary: 'Save face profile (min-N samples)' })
  @Post('enrollment/save')
  @Roles('CLIENT', 'ADMIN')
  enroll(@CurrentUser() user: ReqUser, @Body() dto: SaveEnrollmentDto) {
    return this.enrollment.saveProfile(
      this.requireClient(user),
      user?.branchIds?.[0] ?? null,
      user.id,
      dto,
    );
  }

  @ApiOperation({ summary: 'Re-enroll an employee' })
  @Post('enrollment/re-enroll')
  @Roles('CLIENT', 'ADMIN')
  reEnroll(@CurrentUser() user: ReqUser, @Body() dto: SaveEnrollmentDto) {
    return this.enrollment.reEnroll(
      this.requireClient(user),
      user?.branchIds?.[0] ?? null,
      user.id,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Set/reset an employee attendance PIN (PIN_THEN_FACE mode)',
  })
  @Post('enrollment/set-pin')
  @Roles('CLIENT', 'ADMIN')
  setAttendancePin(
    @CurrentUser() user: ReqUser,
    @Body() dto: SetAttendancePinDto,
  ) {
    return this.enrollment.setAttendancePin(
      this.requireClient(user),
      user.id,
      { employeeId: dto?.employeeId, employeeCode: dto?.employeeCode },
      dto?.pin,
      this.branchScope(user) ?? undefined,
    );
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Mark attendance from captured frames' })
  @Post('attendance/mark')
  @Roles('CLIENT', 'ADMIN', 'EMPLOYEE')
  mark(@CurrentUser() user: ReqUser, @Body() dto: MarkAttendanceDto) {
    return this.attendance.markAttendance(
      this.requireClient(user),
      user?.branchIds?.[0] ?? null,
      null,
      dto,
    );
  }

  @ApiOperation({ summary: 'Employee attendance status for today' })
  @Get('attendance/status/:employeeId')
  @Roles('CLIENT', 'ADMIN', 'EMPLOYEE')
  status(
    @CurrentUser() user: ReqUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.attendance.getStatus(this.requireClient(user), employeeId);
  }

  @ApiOperation({ summary: 'Offline attendance batch sync' })
  @Post('attendance/offline-sync')
  @Roles('CLIENT', 'ADMIN')
  offlineSync(@CurrentUser() user: ReqUser, @Body() dto: OfflineSyncDto) {
    return this.attendance.offlineSync(
      this.requireClient(user),
      user?.branchIds?.[0] ?? null,
      null,
      dto.punches,
    );
  }

  // ── Admin: duplicate alerts ───────────────────────────────────────────────
  @ApiOperation({ summary: 'List duplicate alerts' })
  @Get('admin/duplicate-alerts')
  @Roles('CLIENT', 'ADMIN')
  duplicateAlerts(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    return this.admin.listDuplicateAlerts(
      this.requireClientAdmin(user),
      status,
    );
  }

  @ApiOperation({ summary: 'Approve/reject a duplicate alert' })
  @Post('admin/duplicate-alerts/:alertId/action')
  @Roles('CLIENT', 'ADMIN')
  duplicateAction(
    @CurrentUser() user: ReqUser,
    @Param('alertId') alertId: string,
    @Body() dto: DuplicateActionDto,
  ) {
    return this.admin.actOnDuplicate(
      this.requireClientAdmin(user),
      alertId,
      user.id,
      dto,
    );
  }

  // ── Admin: review queue ───────────────────────────────────────────────────
  @ApiOperation({ summary: 'List review queue' })
  @Get('admin/review-queue')
  @Roles('CLIENT', 'ADMIN')
  reviewQueue(@CurrentUser() user: ReqUser, @Query('status') status?: string) {
    // Branch users may verify their own branch's items; master client users
    // (branchScope null) see all. Scope is enforced in the service.
    return this.admin.listReviewQueue(
      this.requireClient(user),
      status,
      this.branchScope(user),
    );
  }

  @ApiOperation({ summary: 'Act on a review item' })
  @Post('admin/review-queue/:reviewId/action')
  @Roles('CLIENT', 'ADMIN')
  reviewAction(
    @CurrentUser() user: ReqUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReviewActionDto,
  ) {
    return this.admin.actOnReview(
      this.requireClient(user),
      reviewId,
      user.id,
      dto,
      this.branchScope(user),
    );
  }

  @ApiOperation({ summary: 'Scoped captured photo for a review item' })
  @Get('admin/review-queue/:reviewId/photo')
  @Roles('CLIENT', 'ADMIN')
  async reviewPhoto(
    @CurrentUser() user: ReqUser,
    @Param('reviewId') reviewId: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.admin.getReviewPhoto(
      this.requireClient(user),
      reviewId,
      this.branchScope(user),
    );
    if (!photo) throw new NotFoundException('Photo not available');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.buffer);
  }

  // ── Admin: manual corrections ─────────────────────────────────────────────
  @ApiOperation({ summary: 'Request a manual attendance correction' })
  @Post('admin/corrections')
  @Roles('CLIENT', 'ADMIN')
  createCorrection(
    @CurrentUser() user: ReqUser,
    @Body() dto: ManualCorrectionDto,
  ) {
    return this.admin.createCorrection(
      this.requireClient(user),
      user?.branchIds?.[0] ?? null,
      user.id,
      dto,
    );
  }

  @ApiOperation({ summary: 'Approve/reject a manual correction' })
  @Post('admin/corrections/:correctionId/action')
  @Roles('CLIENT', 'ADMIN')
  actCorrection(
    @CurrentUser() user: ReqUser,
    @Param('correctionId') correctionId: string,
    @Body() body: { approve: boolean },
  ) {
    return this.admin.approveCorrection(
      this.requireClient(user),
      correctionId,
      user.id,
      body?.approve === true,
    );
  }

  // ── Device management (admin) ─────────────────────────────────────────────
  @ApiOperation({ summary: 'Provision a kiosk device (returns install token)' })
  @Post('devices')
  @Roles('CLIENT', 'ADMIN')
  provisionDevice(
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      deviceName: string;
      branchId?: string;
      location?: string;
      mode?: 'ATTENDANCE' | 'ENROLLMENT';
      adminPin?: string;
    },
  ) {
    return this.devices.provision(this.requireClientAdmin(user), {
      ...body,
      branchId: body?.branchId ?? user?.branchIds?.[0] ?? null,
    });
  }

  @ApiOperation({ summary: 'List kiosk devices' })
  @Get('devices')
  @Roles('CLIENT', 'ADMIN')
  listDevices(@CurrentUser() user: ReqUser) {
    return this.devices.list(this.requireClient(user), this.branchScope(user));
  }

  @ApiOperation({ summary: 'Revoke a kiosk device' })
  @Post('devices/:deviceId/revoke')
  @Roles('CLIENT', 'ADMIN')
  revokeDevice(
    @CurrentUser() user: ReqUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.revoke(this.requireClientAdmin(user), deviceId);
  }

  @ApiOperation({ summary: 'Delete a revoked kiosk device' })
  @Delete('devices/:deviceId')
  @Roles('CLIENT', 'ADMIN')
  deleteDevice(
    @CurrentUser() user: ReqUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.remove(this.requireClientAdmin(user), deviceId);
  }

  // ── Enrollment tickets (web-initiated) ────────────────────────────────────
  @ApiOperation({ summary: 'Create an enrollment ticket for a kiosk' })
  @Post('enroll-tickets')
  @Roles('CLIENT', 'ADMIN')
  createEnrollTicket(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateEnrollTicketDto,
  ) {
    return this.tickets.create(
      this.requireClient(user),
      user.id,
      dto,
      this.branchScope(user),
    );
  }

  @ApiOperation({ summary: 'List enrollment tickets' })
  @Get('enroll-tickets')
  @Roles('CLIENT', 'ADMIN')
  listEnrollTickets(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    return this.tickets.listByClient(
      this.requireClient(user),
      status,
      this.branchScope(user),
    );
  }

  @ApiOperation({ summary: 'Cancel an enrollment ticket' })
  @Post('enroll-tickets/:ticketId/cancel')
  @Roles('CLIENT', 'ADMIN')
  cancelEnrollTicket(
    @CurrentUser() user: ReqUser,
    @Param('ticketId') ticketId: string,
  ) {
    return this.tickets.cancel(
      this.requireClient(user),
      ticketId,
      this.branchScope(user),
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Dashboard cards' })
  @Get('dashboard')
  @Roles('CLIENT', 'ADMIN')
  dashboardCards(@CurrentUser() user: ReqUser) {
    return this.dashboard.cards(
      this.requireClient(user),
      this.branchScope(user) ?? [],
    );
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Daily attendance report' })
  @Get('reports/daily')
  @Roles('CLIENT', 'ADMIN')
  reportDaily(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.dailyAttendance(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Employee-wise attendance report' })
  @Get('reports/employee')
  @Roles('CLIENT', 'ADMIN')
  reportEmployee(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.employeeSummary(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Branch-wise attendance report' })
  @Get('reports/branch')
  @Roles('CLIENT', 'ADMIN')
  reportBranch(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.branchSummary(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Late coming report' })
  @Get('reports/late')
  @Roles('CLIENT', 'ADMIN')
  reportLate(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.lateComing(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Early going report' })
  @Get('reports/early')
  @Roles('CLIENT', 'ADMIN')
  reportEarly(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.earlyGoing(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Absent report' })
  @Get('reports/absent')
  @Roles('CLIENT', 'ADMIN')
  reportAbsent(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.absent(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Failed face attempts report' })
  @Get('reports/failed')
  @Roles('CLIENT', 'ADMIN')
  reportFailed(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.failedAttempts(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Duplicate enrollment report' })
  @Get('reports/duplicates')
  @Roles('CLIENT', 'ADMIN')
  reportDuplicates(@CurrentUser() user: ReqUser) {
    return this.reports.duplicateReport(this.requireClient(user));
  }

  @ApiOperation({ summary: 'Pending enrollment report' })
  @Get('reports/pending-enrollment')
  @Roles('CLIENT', 'ADMIN')
  reportPending(@CurrentUser() user: ReqUser) {
    return this.reports.pendingEnrollment(
      this.requireClient(user),
      this.branchScope(user) ?? undefined,
    );
  }

  @ApiOperation({ summary: 'Device sync report' })
  @Get('reports/device-sync')
  @Roles('CLIENT', 'ADMIN')
  reportDeviceSync(@CurrentUser() user: ReqUser) {
    return this.reports.deviceSyncReport(this.requireClient(user));
  }

  @ApiOperation({ summary: 'Payroll attendance export (approved only)' })
  @Get('reports/payroll-export')
  @Roles('CLIENT', 'ADMIN')
  payrollExport(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.payrollExport(
      this.requireClient(user),
      this.range(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Push approved attendance to payroll (PayDek)' })
  @Post('payroll/sync')
  @Roles('CLIENT', 'ADMIN')
  payrollSync(
    @CurrentUser() user: ReqUser,
    @Body() body: { from?: string; to?: string },
  ) {
    return this.reports.pushToPayroll(this.requireClient(user), {
      from: body?.from,
      to: body?.to,
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Get FaceDesk settings (percentages)' })
  @Get('settings')
  @Roles('CLIENT', 'ADMIN')
  async getSettings(@CurrentUser() user: ReqUser) {
    return this.settings.getEffective(this.requireClient(user));
  }

  @ApiOperation({ summary: 'Update FaceDesk settings' })
  @Put('settings')
  @Roles('CLIENT', 'ADMIN')
  async updateSettings(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    await this.settings.upsert(this.requireClient(user), dto);
    return this.settings.getEffective(this.requireClient(user));
  }
}
