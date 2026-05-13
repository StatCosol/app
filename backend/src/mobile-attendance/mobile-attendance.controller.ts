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
  EnrollFaceDto,
  EnrollSelfDto,
  MobilePunchDto,
  RegisterMobileDeviceDto,
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

  @ApiOperation({ summary: 'Enroll an employee face (admin or self-service)' })
  @Post('enroll')
  enroll(@CurrentUser() u: ReqUser, @Body() body: EnrollFaceDto) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    return this.svc.enrollFace(u.clientId, u.userId ?? null, body);
  }

  @ApiOperation({ summary: 'Deactivate an employee face enrollment (DPDP delete)' })
  @Delete('enroll/:employeeId')
  deactivate(
    @CurrentUser() u: ReqUser,
    @Param('employeeId') employeeId: string,
    @Query('reason') reason?: string,
  ) {
    if (!u?.clientId) throw new BadRequestException('Client context required');
    return this.svc.deactivateEnrollment(
      u.clientId,
      employeeId,
      u.userId ?? null,
      reason ?? 'Admin deactivation',
    );
  }
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
}
