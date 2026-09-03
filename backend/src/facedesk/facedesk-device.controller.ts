import {
  ConflictException,
  Logger,
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
import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';
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
  private readonly logger = new Logger(FaceDeskDeviceController.name);

  constructor(
    private readonly devices: FaceDeskDeviceService,
    private readonly attendance: FaceDeskAttendanceService,
    private readonly enrollment: FaceDeskEnrollmentService,
    private readonly tickets: FaceDeskTicketService,
    private readonly settings: FaceDeskSettingsService,
    private readonly azureFace: FaceDeskAzureFaceService,
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
    // "The kiosk still asks for a PIN" was unfalsifiable without this. The
    // device is a release build, so R8 strips its logging; nothing on either
    // side recorded which client a device belongs to or which mode it was
    // handed. That left a settings change saved for one client and a device
    // registered to another indistinguishable from a bug in the kiosk — and
    // cost hours of reinstalling an APK that was correct all along.
    //
    // Stays at log/info deliberately. app.module.ts runs Pino at `info` in
    // production, so debug is discarded exactly where this is needed — a kiosk
    // in the field is the only place the question ever gets asked, and a
    // diagnostic that only exists in dev is the same as no diagnostic. The
    // volume argument does not apply either: /config is fetched on activity
    // resume, not per punch, so this is a handful of lines per device per day.
    this.logger.log(
      `device config: deviceId=${d.deviceId} clientId=${d.clientId} ` +
        `identificationMode=${eff.identificationMode}`,
    );
    return {
      mode: d.mode,
      identificationMode: eff.identificationMode,
      frameCaptureCount: eff.frameCaptureCount,
      livenessRequired: eff.livenessRequired,
      offlineSyncEnabled: eff.offlineSyncEnabled,
      // Capture thresholds. The APK carries the same values as defaults, so an
      // older build that ignores this field behaves exactly as before; a device
      // on different camera hardware gets gates that suit it.
      captureTuning: eff.captureTuning,
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
  async save(@Req() req: Request, @Body() dto: SaveEnrollmentDto) {
    const d = this.ctx(req);
    try {
      return await this.enrollment.saveProfile(
        d.clientId,
        d.branchId,
        d.deviceId,
        dto,
      );
    } catch (err) {
      // A ConflictException here means retrying cannot help: the capture was a
      // duplicate now queued for admin review, or the subject is already
      // enrolled. Release the ticket, or this device's poller finds it still
      // open and relaunches enrolment for the same person on a loop — showing
      // the correct refusal every time, which is what makes it look like the
      // refusal did not register.
      //
      // The kiosk cancels its own ticket too; this is the half that survives a
      // kiosk crash or a dropped connection in between. Both are idempotent.
      if (err instanceof ConflictException) {
        await this.tickets
          .cancelOpenForSubject(d.deviceId, d.clientId, dto.employeeId)
          .catch(() => undefined);
      }
      throw err;
    }
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

  @ApiOperation({ summary: 'Device — create an Azure liveness session' })
  @Public()
  @UseGuards(FaceDeskDeviceAuthGuard)
  @Post('liveness/session')
  async livenessSession(@Req() req: Request) {
    const d = this.ctx(req);
    // Returns ONLY the sessionId and a short-lived authToken. The Face account
    // key never leaves the server — that is the reason this endpoint exists
    // rather than the APK holding credentials. The verdict is deliberately not
    // returned here either: the device reports that the check finished, and the
    // decision is read server-side, so a kiosk cannot assert its own liveness.
    const session = await this.azureFace.createDeviceLivenessSession(d.deviceId);
    return { sessionId: session.sessionId, authToken: session.authToken };
  }

}
