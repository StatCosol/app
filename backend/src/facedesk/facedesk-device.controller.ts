import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { FaceDeskDeviceAuthGuard } from './facedesk-device-auth.guard';
import {
  FaceDeskDeviceContext,
  FaceDeskDeviceService,
} from './facedesk-device.service';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';
import {
  MarkAttendanceDto,
  OfflineSyncDto,
  SaveEnrollmentDto,
  ValidateQualityDto,
} from './facedesk.dto';

/**
 * Kiosk device-facing FaceDesk endpoints. Authenticated by device token
 * (facedesk_kiosk_devices), not a user JWT — client/branch are derived from
 * the device. @Public() bypasses the global JWT guard; the device guard runs
 * instead.
 */
@ApiTags('FaceDesk V2 — Device')
@Controller({ path: 'facedesk/device', version: '1' })
export class FaceDeskDeviceController {
  constructor(
    private readonly devices: FaceDeskDeviceService,
    private readonly attendance: FaceDeskAttendanceService,
    private readonly enrollment: FaceDeskEnrollmentService,
  ) {}

  private ctx(req: Request): FaceDeskDeviceContext {
    return (req as any).facedeskDevice as FaceDeskDeviceContext;
  }

  @ApiOperation({ summary: 'Device — bind androidId to an install token' })
  @Public()
  @Post('register')
  register(@Body() body: { installToken: string; androidId: string }) {
    return this.devices.register(body?.installToken, body?.androidId);
  }

  @ApiOperation({ summary: 'Device — mark attendance' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('attendance/mark')
  mark(@Req() req: Request, @Body() dto: MarkAttendanceDto) {
    const d = this.ctx(req);
    return this.attendance.markAttendance(
      d.clientId,
      d.branchId,
      d.deviceId,
      dto,
    );
  }

  @ApiOperation({ summary: 'Device — offline attendance sync' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('attendance/offline-sync')
  offlineSync(@Req() req: Request, @Body() dto: OfflineSyncDto) {
    const d = this.ctx(req);
    return this.attendance.offlineSync(
      d.clientId,
      d.branchId,
      d.deviceId,
      dto.punches,
    );
  }

  @ApiOperation({ summary: 'Device — pending employees (enrollment mode)' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Get('enrollment/pending')
  pending(@Req() req: Request) {
    const d = this.ctx(req);
    return this.enrollment.getPendingEmployees(
      d.clientId,
      d.branchId ? [d.branchId] : [],
    );
  }

  @ApiOperation({ summary: 'Device — validate face quality' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('enrollment/validate-quality')
  validate(@Req() req: Request, @Body() dto: ValidateQualityDto) {
    return this.enrollment.validateQuality(dto);
  }

  @ApiOperation({ summary: 'Device — save enrollment' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('enrollment/save')
  save(@Req() req: Request, @Body() dto: SaveEnrollmentDto) {
    const d = this.ctx(req);
    return this.enrollment.saveProfile(d.clientId, d.branchId, d.deviceId, dto);
  }
}
