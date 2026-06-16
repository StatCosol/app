import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

import { DeviceService } from './devices/device.service';
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
  constructor(private readonly deviceService: DeviceService) {}

  @ApiOperation({ summary: 'Register / bind a device using its install token' })
  @Post('register')
  register(@Body() dto: RegisterDeviceDto) {
    return this.deviceService.registerDevice(dto.installToken, dto.androidId, dto.deviceName);
  }

  @ApiOperation({ summary: 'List devices for the current client' })
  @Get()
  list(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.deviceService.listByClient(clientId);
  }

  @ApiOperation({ summary: 'Revoke a device' })
  @Delete(':deviceId')
  revoke(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.deviceService.revokeDevice(clientId, deviceId, user.userId);
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

  @ApiOperation({ summary: 'ESS — employee self-enroll from their phone' })
  @Post('self')
  @Roles('EMPLOYEE', 'CLIENT', 'ADMIN')
  selfEnroll(@CurrentUser() user: ReqUser, @Body() dto: SelfEnrollDto) {
    const employeeId = user?.employeeId ?? user?.userId;
    const clientId = user?.clientId;
    if (!employeeId || !clientId) throw new BadRequestException('Employee context required');
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
  createTicket(@CurrentUser() user: ReqUser, @Body() dto: CreateKioskTicketDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.createKioskTicket(
      clientId,
      user?.branchIds?.[0] ?? null,
      dto,
      user.userId,
    );
  }

  @ApiOperation({ summary: 'Device — submit captured frames for a kiosk ticket' })
  @Post('kiosk/submit')
  @Roles('CLIENT', 'ADMIN', 'DEVICE')
  submitTicket(
    @CurrentUser() user: ReqUser,
    @Body() dto: SubmitKioskTicketDto,
    @Req() req: Request,
  ) {
    const deviceId = (req as any).deviceId as string | undefined;
    if (!deviceId) throw new UnauthorizedException('Device authentication required');
    return this.enrollmentService.submitKioskTicket(deviceId, dto, user?.userId ?? deviceId);
  }

  @ApiOperation({ summary: 'List enrollment tickets' })
  @Get('kiosk/tickets')
  @Roles('CLIENT', 'ADMIN')
  listTickets(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.listTickets(clientId, status);
  }

  @ApiOperation({ summary: 'Get a single enrollment ticket' })
  @Get('kiosk/tickets/:ticketId')
  @Roles('CLIENT', 'ADMIN')
  getTicket(@Param('ticketId') ticketId: string) {
    return this.enrollmentService.getTicket(ticketId);
  }

  @ApiOperation({ summary: 'Deactivate a face enrollment (DPDP crypto-shred)' })
  @Post('deactivate')
  @Roles('CLIENT', 'ADMIN')
  deactivate(@CurrentUser() user: ReqUser, @Body() dto: DeactivateEnrollmentDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.deactivateEnrollment(clientId, dto, user.userId);
  }

  @ApiOperation({ summary: 'Admin — list all active employee enrollments' })
  @Get('employees')
  @Roles('CLIENT', 'ADMIN')
  listEmployeeEnrollments(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.listEmployeeEnrollments(clientId);
  }

  @ApiOperation({ summary: 'Admin — list all contractor enrollments' })
  @Get('contractors')
  @Roles('CLIENT', 'ADMIN')
  listContractorEnrollments(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.enrollmentService.listContractorEnrollments(clientId);
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
    return this.enrollmentService.cancelKioskTicket(clientId, ticketId, user.userId);
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
  @Post('challenge')
  @Roles('CLIENT', 'ADMIN', 'DEVICE', 'EMPLOYEE')
  issueChallenge(@Req() req: Request, @Body() dto: IssueChallengeDto) {
    const deviceId = (req as any).deviceId as string | undefined;
    if (!deviceId) throw new UnauthorizedException('Device authentication required');
    return this.livenessService.issueChallenge(deviceId, dto.employeeId, dto.offline ?? false);
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

  @ApiOperation({ summary: 'Record an attendance punch (face match + liveness)' })
  @Post()
  @Roles('CLIENT', 'ADMIN', 'DEVICE', 'EMPLOYEE')
  async recordPunch(
    @Req() req: Request,
    @Body() dto: RecordPunchDto,
  ) {
    const deviceId = (req as any).deviceId as string | undefined;
    if (!deviceId) throw new UnauthorizedException('Device authentication required');
    const device = await this.deviceService.findById(deviceId);
    if (!device) throw new UnauthorizedException('Device not found');
    const ip = req.ip ?? req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.punchService.recordPunch(device, dto, ip, ua);
  }

  @ApiOperation({ summary: 'Fetch the face roster for offline use' })
  @Get('roster')
  @Roles('CLIENT', 'ADMIN', 'DEVICE')
  async getRoster(@Req() req: Request) {
    const deviceId = (req as any).deviceId as string | undefined;
    if (!deviceId) throw new UnauthorizedException('Device authentication required');
    const device = await this.deviceService.findById(deviceId);
    if (!device) throw new UnauthorizedException('Device not found');
    const roster = await this.punchService.getRoster(device);
    return roster.map((r) => ({
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      embeddingModel: r.embeddingModel,
      // Return embedding as base64 for the device to cache
      embeddingB64: Buffer.from(r.embedding.buffer).toString('base64'),
    }));
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
    @Body() body: { contractorEmployeeId: string; punchTime: string; direction: 'IN' | 'OUT' | 'AUTO' },
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
  deleteContractorPunch(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.punchService.deleteContractorPunch(clientId, id);
  }
}
