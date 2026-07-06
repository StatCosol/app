import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { FaceDeskAdminService } from './facedesk-admin.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import {
  CheckDuplicateDto,
  DuplicateActionDto,
  ManualCorrectionDto,
  MarkAttendanceDto,
  OfflineSyncDto,
  ReviewActionDto,
  SaveEnrollmentDto,
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
  ) {}

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

  // ── Enrollment ────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Pending employees for enrollment' })
  @Get('enrollment/pending')
  @Roles('CLIENT', 'ADMIN')
  pending(@CurrentUser() user: ReqUser) {
    return this.enrollment.getPendingEmployees(
      this.requireClient(user),
      this.branchScope(user) ?? [],
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
    return this.admin.listDuplicateAlerts(this.requireClient(user), status);
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
      this.requireClient(user),
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
    return this.admin.listReviewQueue(this.requireClient(user), status);
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
    );
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
