import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { FaceDeskTicketService } from './facedesk-ticket.service';
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
    private readonly tickets: FaceDeskTicketService,
    private readonly settings: FaceDeskSettingsService,
  ) {}

  private ctx(req: Request): FaceDeskDeviceContext {
    return (req as any).facedeskDevice as FaceDeskDeviceContext;
  }

  @ApiOperation({ summary: 'Device — bind androidId to an install token' })
  @Public()
  @Post('register')
  async register(
    @Body()
    body: { installToken: string; androidId: string; appVersion?: string },
  ) {
    const res = await this.devices.register(
      body?.installToken,
      body?.androidId,
      body?.appVersion,
    );
    const eff = await this.settings.getEffective(res.clientId);
    const branding = await this.devices.getKioskBranding(res.deviceId);
    // Tell the kiosk which capture flow to run.
    return {
      ...res,
      identificationMode: eff.identificationMode,
      frameCaptureCount: eff.frameCaptureCount,
      livenessRequired: eff.livenessRequired,
      branding,
    };
  }

  @ApiOperation({
    summary: 'Device — current kiosk config (mode/thresholds) for this device',
  })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Get('config')
  async config(@Req() req: Request) {
    const d = this.ctx(req);
    const eff = await this.settings.getEffective(d.clientId);
    const branding = await this.devices.getKioskBranding(d.deviceId);
    return {
      mode: d.mode,
      identificationMode: eff.identificationMode,
      frameCaptureCount: eff.frameCaptureCount,
      livenessRequired: eff.livenessRequired,
      offlineSyncEnabled: eff.offlineSyncEnabled,
      branding,
    };
  }

  @ApiOperation({ summary: 'Device — mark attendance' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('attendance/mark')
  async mark(@Req() req: Request, @Body() dto: MarkAttendanceDto) {
    const d = this.ctx(req);
    if (dto.appVersion || dto.offlineQueueDepth != null) {
      await this.devices.recordTelemetry(d.deviceId, {
        appVersion: dto.appVersion,
        offlineQueueDepth: dto.offlineQueueDepth,
      });
    }
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
  async offlineSync(@Req() req: Request, @Body() dto: OfflineSyncDto) {
    const d = this.ctx(req);
    if (dto.appVersion) {
      await this.devices.recordTelemetry(d.deviceId, {
        appVersion: dto.appVersion,
        offlineQueueDepth: dto.offlineQueueDepth,
      });
    }
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
  pending(
    @Req() req: Request,
    @Query('subjectType') subjectType?: string,
  ) {
    const d = this.ctx(req);
    return this.enrollment.getPendingEmployees(
      d.clientId,
      d.branchId ? [d.branchId] : [],
      subjectType === 'CONTRACTOR' ? 'CONTRACTOR' : 'EMPLOYEE',
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

  // ── Enrollment ticket polling (web-initiated enrollment) ───────────────────
  @ApiOperation({
    summary: 'Device — poll the pending enrollment ticket for this device',
  })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Get('enroll-ticket/pending')
  pendingTicket(@Req() req: Request) {
    const d = this.ctx(req);
    return this.tickets.getPendingForDevice(d.deviceId);
  }

  @ApiOperation({ summary: 'Device — mark a ticket as capturing' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('enroll-ticket/:ticketId/capturing')
  ticketCapturing(@Param('ticketId') ticketId: string) {
    return this.tickets.markCapturing(ticketId);
  }

  @ApiOperation({ summary: 'Device — complete an enrollment ticket' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('enroll-ticket/:ticketId/complete')
  completeTicket(@Req() req: Request, @Param('ticketId') ticketId: string) {
    const d = this.ctx(req);
    return this.tickets.complete(ticketId, d.deviceId);
  }

  @ApiOperation({
    summary: 'Device — cancel an enrollment ticket (kiosk abandoned/timed out)',
  })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('enroll-ticket/:ticketId/cancel')
  cancelTicket(@Req() req: Request, @Param('ticketId') ticketId: string) {
    const d = this.ctx(req);
    return this.tickets.abandon(ticketId, d.deviceId);
  }
}
