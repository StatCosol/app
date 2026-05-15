import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  CreateContractorReenrollRequestDto,
  ContractorMobilePunchDto,
  EnrollContractorFaceDto,
  EnrollFaceDto,
  EnrollSelfDto,
  MobilePunchDto,
  RegisterMobileDeviceDto,
  CreateReenrollRequestDto,
  ReviewReenrollRequestDto,
} from './mobile-attendance.dto';
import { MobileAttendanceService } from './mobile-attendance.service';

// =============================================================================
// Admin / Client controller — register devices, enroll faces, view roster.
// Authenticated via the standard JWT + roles flow.
// =============================================================================
@ApiTags('Mobile Attendance (Admin)')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/mobile-attendance', version: '1' })
@Roles('CLIENT', 'ADMIN', 'CRM')
export class MobileAttendanceAdminController {
  constructor(private readonly svc: MobileAttendanceService) {}

  @ApiOperation({ summary: 'List registered mobile attendance devices' })
  @Get('devices')
  listDevices(@CurrentUser() u: ReqUser) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    return this.svc.listDevices(u.clientId);
  }

  @ApiOperation({ summary: 'Register a new mobile attendance device (kiosk or ESS)' })
  @Post('devices')
  registerDevice(@CurrentUser() u: ReqUser, @Body() body: RegisterMobileDeviceDto) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    return this.svc.registerDevice(u.clientId, u.userId ?? null, body);
  }

  @ApiOperation({ summary: 'Revoke a mobile attendance device' })
  @Delete('devices/:id')
  revokeDevice(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    return this.svc.revokeDevice(u.clientId, id, u.userId ?? null);
  }

  @ApiOperation({ summary: 'Permanently delete a revoked mobile attendance device' })
  @Delete('devices/:id/permanent')
  hardDeleteDevice(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    return this.svc.hardDeleteDevice(u.clientId, id);
  }

  @ApiOperation({ summary: 'Enroll an employee face (admin, branch desk, or self-service)' })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Post('enroll')
  enroll(@CurrentUser() u: ReqUser, @Body() body: EnrollFaceDto) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.enrollFace(u.clientId, u.userId ?? null, body, allowedBranchIds);
  }

  @ApiOperation({ summary: 'List employees with face-enrollment status (Enrolled / Pending)' })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('enrollments')
  listEnrollments(@CurrentUser() u: ReqUser) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.listEnrollmentStatus(u.clientId, allowedBranchIds);
  }

  @ApiOperation({ summary: 'Deactivate an employee face enrollment (DPDP delete)' })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Delete('enroll/:employeeId')
  deactivate(
    @CurrentUser() u: ReqUser,
    @Param('employeeId') employeeId: string,
    @Query('reason') reason?: string,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.deactivateEnrollment(
      u.clientId,
      employeeId,
      u.userId ?? null,
      reason ?? 'Admin deactivation',
      allowedBranchIds,
    );
  }

  // ----------------------------- Phase 3e: re-enrollment approval queue.

  @ApiOperation({
    summary:
      'Submit a re-enrollment request (held PENDING until a reviewer approves)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Post('reenroll-requests')
  createReenroll(
    @CurrentUser() u: ReqUser,
    @Body() body: CreateReenrollRequestDto,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.createReenrollRequest(
      u.clientId,
      u.userId ?? null,
      body,
      allowedBranchIds,
    );
  }

  @ApiOperation({ summary: 'List re-enrollment requests by status (default PENDING)' })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('reenroll-requests')
  listReenroll(
    @CurrentUser() u: ReqUser,
    @Query('status')
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' = 'PENDING',
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.listReenrollRequests(u.clientId, status, allowedBranchIds);
  }

  @ApiOperation({ summary: 'Approve or reject a re-enrollment request' })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Post('reenroll-requests/:id/review')
  reviewReenroll(
    @CurrentUser() u: ReqUser,
    @Param('id') id: string,
    @Body() body: ReviewReenrollRequestDto,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.reviewReenrollRequest(
      u.clientId,
      id,
      u.userId ?? null,
      body,
      allowedBranchIds,
    );
  }

  // -------------------------- Phase 4a: contractor face-attendance bridge.

  @ApiOperation({
    summary: 'Enroll a contractor employee face (admin or branch desk)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Post('contractors/enroll')
  enrollContractor(
    @CurrentUser() u: ReqUser,
    @Body() body: EnrollContractorFaceDto,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.enrollContractorFace(
      u.clientId,
      u.userId ?? null,
      body,
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary:
      'List contractor employees with face-enrollment status (Enrolled / Pending)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('contractors/enrollments')
  listContractorEnrollments(@CurrentUser() u: ReqUser) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.listContractorEnrollmentStatus(
      u.clientId,
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary: 'Deactivate a contractor employee face enrollment (DPDP delete)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Delete('contractors/enroll/:contractorEmployeeId')
  deactivateContractor(
    @CurrentUser() u: ReqUser,
    @Param('contractorEmployeeId') contractorEmployeeId: string,
    @Query('reason') reason?: string,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.deactivateContractorEnrollment(
      u.clientId,
      contractorEmployeeId,
      u.userId ?? null,
      reason ?? 'Admin deactivation',
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary:
      'List recent contractor kiosk punches (optional from/to/branch/contractor/contractorUser filters)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('contractors/punches')
  listContractorPunches(
    @CurrentUser() u: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorEmployeeId') contractorEmployeeId?: string,
    @Query('contractorUserId') contractorUserId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.listContractorPunches(
      u.clientId,
      {
        from: from ?? null,
        to: to ?? null,
        branchId: branchId ?? null,
        contractorEmployeeId: contractorEmployeeId ?? null,
        contractorUserId: contractorUserId ?? null,
        limit: limit ? Number(limit) : null,
      },
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary:
      'List recent face-attendance rejections (optional window / subject / reason / branch filters)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('failed-scans')
  listFailedScans(
    @CurrentUser() u: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('reason') reason?: string,
    @Query('subjectType') subjectType?: 'EMPLOYEE' | 'CONTRACTOR',
    @Query('employeeId') employeeId?: string,
    @Query('contractorEmployeeId') contractorEmployeeId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    const subj =
      subjectType === 'EMPLOYEE' || subjectType === 'CONTRACTOR'
        ? subjectType
        : null;
    return this.svc.listFailedScans(
      u.clientId,
      {
        from: from ?? null,
        to: to ?? null,
        branchId: branchId ?? null,
        reason: reason ?? null,
        subjectType: subj,
        employeeId: employeeId ?? null,
        contractorEmployeeId: contractorEmployeeId ?? null,
        limit: limit ? Number(limit) : null,
      },
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary:
      'Aggregated face-attendance failure counts (total / by reason / by branch / by day / by subject) for dashboards',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('failed-scans/stats')
  failedScanStats(
    @CurrentUser() u: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('subjectType') subjectType?: 'EMPLOYEE' | 'CONTRACTOR',
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    const subj =
      subjectType === 'EMPLOYEE' || subjectType === 'CONTRACTOR'
        ? subjectType
        : null;
    return this.svc.failedScanStats(
      u.clientId,
      {
        from: from ?? null,
        to: to ?? null,
        branchId: branchId ?? null,
        subjectType: subj,
      },
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary:
      'List contractors (parent vendors) with active employees in the caller\u2019s allowed branches; drives the branch-portal contractor picker',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('contractors/for-branch')
  listContractorsForBranch(
    @CurrentUser() u: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.listContractorsForBranch(
      u.clientId,
      { branchId: branchId ?? null },
      allowedBranchIds,
    );
  }

  // -------------- Phase 4c: contractor re-enrollment approval queue.

  @ApiOperation({
    summary:
      'Submit a contractor re-enrollment request (held PENDING until reviewed)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Post('contractors/reenroll-requests')
  createContractorReenroll(
    @CurrentUser() u: ReqUser,
    @Body() body: CreateContractorReenrollRequestDto,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.createContractorReenrollRequest(
      u.clientId,
      u.userId ?? null,
      body,
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary:
      'List contractor re-enrollment requests by status (default PENDING)',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Get('contractors/reenroll-requests')
  listContractorReenroll(
    @CurrentUser() u: ReqUser,
    @Query('status')
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' = 'PENDING',
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.listContractorReenrollRequests(
      u.clientId,
      status,
      allowedBranchIds,
    );
  }

  @ApiOperation({
    summary: 'Approve or reject a contractor re-enrollment request',
  })
  @Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
  @Post('contractors/reenroll-requests/:id/review')
  reviewContractorReenroll(
    @CurrentUser() u: ReqUser,
    @Param('id') id: string,
    @Body() body: ReviewReenrollRequestDto,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    const allowedBranchIds = scopeBranchIds(u);
    return this.svc.reviewContractorReenrollRequest(
      u.clientId,
      id,
      u.userId ?? null,
      body,
      allowedBranchIds,
    );
  }
}

/**
 * Branch-scoped users (CLIENT + userType=BRANCH, virtual BRANCH_DESK) may
 * only enroll/deactivate employees inside their own branchIds. Non-branch
 * roles (ADMIN/CRM/CLIENT-master) get `null` meaning unrestricted.
 */
function scopeBranchIds(u: ReqUser): string[] | null {
  if (u?.userType === 'BRANCH') return u.branchIds ?? [];
  return null;
}

// =============================================================================
// Mobile-app controller — used by the Android app. Authenticated via the
// per-device install token (header `X-Device-Token`). For ESS punches the
// app additionally sends the user JWT so we can enforce employee identity.
// =============================================================================
@ApiTags('Mobile Attendance (Device)')
@Controller({ path: 'mobile-attendance', version: '1' })
@Public()
export class MobileAttendanceDeviceController {
  constructor(private readonly svc: MobileAttendanceService) {}

  @ApiOperation({ summary: 'Pull device config + employee roster (with embeddings)' })
  @Get('roster')
  async roster(@Headers('x-device-token') token: string) {
    const dev = await this.svc.resolveDeviceByToken(token);
    return this.svc.roster(dev);
  }

  @ApiOperation({ summary: 'ESS self-enroll — from the device-bound employee phone' })
  @Post('enroll-self')
  async enrollSelf(
    @Headers('x-device-token') token: string,
    @Body() body: EnrollSelfDto,
  ) {
    const dev = await this.svc.resolveDeviceByToken(token);
    return this.svc.enrollSelf(dev, body);
  }

  @ApiOperation({ summary: 'Submit a face-verified attendance punch' })
  @Post('punch')
  async punch(
    @Headers('x-device-token') token: string,
    @Body() body: MobilePunchDto,
  ) {
    const dev = await this.svc.resolveDeviceByToken(token);
    return this.svc.recordPunch(dev, body);
  }

  @ApiOperation({ summary: 'Submit a face-verified contractor attendance punch (KIOSK only)' })
  @Post('punch/contractor')
  async contractorPunch(
    @Headers('x-device-token') token: string,
    @Body() body: ContractorMobilePunchDto,
  ) {
    const dev = await this.svc.resolveDeviceByToken(token);
    return this.svc.recordContractorPunch(dev, body);
  }
}
