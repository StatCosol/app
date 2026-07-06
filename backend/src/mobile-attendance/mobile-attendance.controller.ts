import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';

import { DeviceService } from './devices/device.service';
import { DeviceAuthGuard } from './devices/device-auth.guard';
import { RegisterDeviceDto, RevokeDeviceDto } from './devices/device.dto';

import { EnrollmentService } from './enrollment/enrollment.service';
import {
  CreateKioskTicketDto,
  DeactivateEnrollmentDto,
  SelfEnrollDto,
  SubmitKioskTicketDto,
} from './enrollment/enrollment.dto';

import { PunchService } from './punch/punch.service';
import { RecordPunchDto } from './punch/punch.dto';

import { LivenessService } from './liveness/liveness.service';
import { IssueChallengeDto } from './liveness/liveness.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Device management  (admin / client role)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Mobile Attendance — Devices')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/devices', version: '1' })
@Roles('CLIENT', 'ADMIN')
export class MobileAttendanceDevicesController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  @ApiOperation({
    summary: 'Admin — provision a new device and generate an install token',
  })
  @Post()
  provision(
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      mode: 'KIOSK' | 'ESS';
      branchId?: string;
      deviceLabel?: string;
      geofenceLat?: number;
      geofenceLng?: number;
      geofenceRadiusM?: number;
    },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.deviceService.provisionDevice(
      clientId,
      body.mode,
      body.branchId ?? null,
      body.deviceLabel ?? null,
      user.userId,
      body.geofenceLat ?? null,
      body.geofenceLng ?? null,
      body.geofenceRadiusM ?? null,
    );
  }

  @ApiOperation({
    summary: 'Device — bind androidId to a pre-provisioned install token',
  })
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDeviceDto) {
    const device = await this.deviceService.registerDevice(
      dto.installToken,
      dto.androidId,
      dto.deviceName,
    );
    return {
      deviceToken: device.installToken,
      deviceId: device.id,
      mode: device.mode,
      clientId: device.clientId,
      branchId: device.branchId ?? null,
    };
  }

  @ApiOperation({ summary: 'List devices for the current client' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const includeInstallToken = await this.entitlements.hasModule(
      clientId,
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    return this.deviceService.listByClient(
      clientId,
      user.branchIds ?? [],
      includeInstallToken,
    );
  }

  @ApiOperation({ summary: 'Revoke a device' })
  @Delete(':deviceId')
  revoke(@Param('deviceId') deviceId: string, @CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.deviceService.revokeDevice(
      clientId,
      deviceId,
      user.userId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Permanently delete a revoked device' })
  @Delete(':deviceId/permanent')
  permanentlyDelete(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.deviceService.permanentlyDeleteDevice(
      clientId,
      deviceId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Rename a device label' })
  @Patch(':deviceId/label')
  renameDevice(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { deviceLabel: string },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.deviceService.renameDevice(
      clientId,
      deviceId,
      body.deviceLabel,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Configure or clear the geofence for a device' })
  @Put(':deviceId/geofence')
  configureGeofence(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { lat?: number; lng?: number; radiusM?: number } | null,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const params =
      body && body.lat != null && body.lng != null && body.radiusM != null
        ? { lat: body.lat, lng: body.lng, radiusM: body.radiusM }
        : null;
    return this.deviceService.configureGeofence(deviceId, clientId, params);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment  (admin creates tickets; device submits; ESS self-enroll)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Mobile Attendance — Enrollment')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/enrollment', version: '1' })
export class MobileAttendanceEnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  private branchScope(user: ReqUser): string[] | null {
    return user?.roleCode === 'CLIENT' && user?.userType === 'BRANCH'
      ? (user.branchIds ?? [])
      : null;
  }

  @ApiOperation({ summary: 'ESS — employee self-enroll from their phone' })
  @Post('self')
  @Roles('EMPLOYEE', 'CLIENT', 'ADMIN')
  selfEnroll(@CurrentUser() user: ReqUser, @Body() dto: SelfEnrollDto) {
    const employeeId = user?.employeeId ?? user?.userId;
    const clientId = user?.clientId;
    if (!employeeId || !clientId)
      throw new BadRequestException('Employee context required');
    return this.enrollmentService.enrollSelf(
      employeeId,
      clientId,
      user?.branchIds?.[0] ?? null,
      dto,
      user.userId,
    );
  }

  @ApiOperation({ summary: 'Admin — create a kiosk enrollment ticket' })
  @Post('kiosk/ticket')
  @Roles('CLIENT', 'ADMIN')
  createTicket(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateKioskTicketDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.createKioskTicket(
      clientId,
      user?.branchIds?.[0] ?? null,
      dto,
      user.userId,
      this.branchScope(user),
    );
  }

  @ApiOperation({
    summary: 'Device — get the current PENDING ticket assigned to this device',
  })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('kiosk/pending')
  getPendingTicket(@Req() req: Request) {
    const deviceId = (req as any).deviceId as string;
    return this.enrollmentService.getPendingTicketForDevice(deviceId);
  }

  @ApiOperation({
    summary: 'Device — submit captured frames for a kiosk ticket',
  })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('kiosk/submit')
  submitTicket(@Req() req: Request, @Body() dto: SubmitKioskTicketDto) {
    const deviceId = (req as any).deviceId as string;
    return this.enrollmentService.submitKioskTicket(deviceId, dto);
  }

  @ApiOperation({ summary: 'List enrollment tickets' })
  @Get('kiosk/tickets')
  @Roles('CLIENT', 'ADMIN')
  listTickets(@CurrentUser() user: ReqUser, @Query('status') status?: string) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.listTickets(clientId, status);
  }

  @ApiOperation({ summary: 'Get a single enrollment ticket' })
  @Get('kiosk/tickets/:ticketId')
  @Roles('CLIENT', 'ADMIN')
  getTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.getTicket(ticketId, clientId);
  }

  @ApiOperation({
    summary: 'Stream a kiosk-ticket face photo (client + branch scoped)',
  })
  @Get('kiosk/tickets/:ticketId/photo')
  @Roles('CLIENT', 'ADMIN')
  async getTicketPhoto(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const photo = await this.enrollmentService.getTicketPhoto(
      clientId,
      ticketId,
      this.branchScope(user),
    );
    if (!photo) throw new NotFoundException('Photo not available');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.buffer);
  }

  @ApiOperation({ summary: 'Deactivate a face enrollment (DPDP crypto-shred)' })
  @Post('deactivate')
  @Roles('CLIENT', 'ADMIN')
  deactivate(
    @CurrentUser() user: ReqUser,
    @Body() dto: DeactivateEnrollmentDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.deactivateEnrollment(
      clientId,
      dto,
      user.userId,
      this.branchScope(user),
    );
  }

  @ApiOperation({ summary: 'Admin — list all active employee enrollments' })
  @Get('employees')
  @Roles('CLIENT', 'ADMIN')
  listEmployeeEnrollments(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.listEmployeeEnrollments(
      clientId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Admin — list all contractor enrollments' })
  @Get('contractors')
  @Roles('CLIENT', 'ADMIN')
  listContractorEnrollments(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.listContractorEnrollments(
      clientId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Admin — cancel a kiosk enrollment ticket' })
  @Post('kiosk/tickets/:ticketId/cancel')
  @Roles('CLIENT', 'ADMIN')
  cancelKioskTicket(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: ReqUser,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.cancelKioskTicket(
      clientId,
      ticketId,
      user.userId,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Liveness challenges
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Mobile Attendance — Liveness')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/liveness', version: '1' })
export class MobileAttendanceLivenessController {
  constructor(private readonly livenessService: LivenessService) {}

  @ApiOperation({ summary: 'Issue a liveness challenge nonce for a device' })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('challenge')
  issueChallenge(@Req() req: Request, @Body() dto: IssueChallengeDto) {
    const deviceId = (req as any).deviceId as string;
    return this.livenessService.issueChallenge(
      deviceId,
      dto.employeeId,
      dto.offline ?? false,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance punches
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Mobile Attendance — Punches')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/punches', version: '1' })
export class MobileAttendancePunchesController {
  constructor(
    private readonly punchService: PunchService,
    private readonly deviceService: DeviceService,
  ) {}

  @ApiOperation({
    summary: 'Record an attendance punch (face match + liveness)',
  })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post()
  async recordPunch(@Req() req: Request, @Body() dto: RecordPunchDto) {
    const deviceId = (req as any).deviceId as string;
    const device = await this.deviceService.findById(deviceId);
    if (!device) throw new UnauthorizedException('Device not found');
    const ip = req.ip ?? req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.punchService.recordPunch(device, dto, ip, ua);
  }

  @ApiOperation({ summary: 'Fetch the face roster for offline use' })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('roster')
  async getRoster(@Req() req: Request) {
    const deviceId = (req as any).deviceId as string;
    const device = await this.deviceService.findById(deviceId);
    if (!device) throw new UnauthorizedException('Device not found');
    const roster = await this.punchService.getRoster(device);
    return {
      enrollments: roster.map((r) => ({
        employeeId: r.subjectId,
        displayName: r.displayName,
        embeddingModel: r.embeddingModel ?? '',
        // Slice to view boundaries to avoid leaking bytes from a pooled backing buffer
        embeddingB64: Buffer.from(
          r.embedding.buffer,
          r.embedding.byteOffset,
          r.embedding.byteLength,
        ).toString('base64'),
      })),
    };
  }

  @ApiOperation({
    summary: 'Admin — list punches held for review (two-level decision)',
  })
  @Get('review')
  @Roles('CLIENT', 'ADMIN')
  listReviewPunches(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.listReviewPunches(clientId, {
      status,
      branchIds: branchId ? [branchId] : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({
    summary: 'Admin — approve or reject a punch held for review',
  })
  @Post('review/:subjectType/:punchId')
  @Roles('CLIENT', 'ADMIN')
  reviewPunch(
    @CurrentUser() user: ReqUser,
    @Param('subjectType') subjectType: string,
    @Param('punchId') punchId: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; note?: string },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const kind = String(subjectType || '').toUpperCase();
    if (kind !== 'EMPLOYEE' && kind !== 'CONTRACTOR') {
      throw new BadRequestException(
        'subjectType must be employee or contractor',
      );
    }
    if (body?.action !== 'APPROVE' && body?.action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT');
    }
    return this.punchService.reviewPunch(
      clientId,
      kind,
      punchId,
      body.action,
      user.id,
      body.note,
    );
  }

  /** Branch-user scope: CLIENT+BRANCH sees only its branches; else unrestricted. */
  private punchBranchScope(user: ReqUser): string[] | null {
    return user?.roleCode === 'CLIENT' && user?.userType === 'BRANCH'
      ? (user.branchIds ?? [])
      : null;
  }

  @ApiOperation({
    summary: 'Stream a punch face photo (client + branch scoped)',
  })
  @Get('review/:subjectType/:punchId/photo')
  @Roles('CLIENT', 'ADMIN')
  async getPunchPhoto(
    @CurrentUser() user: ReqUser,
    @Param('subjectType') subjectType: string,
    @Param('punchId') punchId: string,
    @Res() res: Response,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const kind = String(subjectType || '').toUpperCase();
    if (kind !== 'EMPLOYEE' && kind !== 'CONTRACTOR') {
      throw new BadRequestException(
        'subjectType must be employee or contractor',
      );
    }
    const photo = await this.punchService.getPunchPhoto(
      clientId,
      kind,
      punchId,
      this.punchBranchScope(user),
    );
    if (!photo) throw new NotFoundException('Photo not available');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.buffer);
  }

  @ApiOperation({ summary: 'Admin — list employee punches with filters' })
  @Get('employee')
  @Roles('CLIENT', 'ADMIN')
  listPunches(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.listPunches(clientId, {
      from,
      to,
      branchId,
      employeeId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({ summary: 'Admin — list contractor punches with filters' })
  @Get('contractor')
  @Roles('CLIENT', 'ADMIN')
  listContractorPunches(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorEmployeeId') contractorEmployeeId?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.listContractorPunches(clientId, {
      from,
      to,
      branchId,
      contractorEmployeeId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({ summary: 'Admin — create a manual contractor punch' })
  @Post('contractor')
  @Roles('CLIENT', 'ADMIN')
  createContractorPunch(
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      contractorEmployeeId: string;
      punchTime: string;
      direction: 'IN' | 'OUT' | 'AUTO';
    },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.createContractorPunch(clientId, body);
  }

  @ApiOperation({ summary: 'Admin — update a contractor punch' })
  @Put('contractor/:id')
  @Roles('CLIENT', 'ADMIN')
  updateContractorPunch(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { punchTime?: string; direction?: string },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.updateContractorPunch(clientId, id, body);
  }

  @ApiOperation({ summary: 'Admin — delete a contractor punch' })
  @Delete('contractor/:id')
  @Roles('CLIENT', 'ADMIN')
  deleteContractorPunch(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.deleteContractorPunch(clientId, id);
  }
}
