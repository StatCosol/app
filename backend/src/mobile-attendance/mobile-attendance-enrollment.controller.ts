import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { DeviceAuthGuard } from './devices/device-auth.guard';
import { EnrollmentService } from './enrollment/enrollment.service';
import {
  CreateKioskTicketDto,
  DeactivateEnrollmentDto,
  ReviewReenrollDto,
  SelfEnrollDto,
  SubmitKioskTicketDto,
} from './enrollment/enrollment.dto';
import { ReenrollmentService } from './enrollment/reenrollment.service';
import {
  mobileAttendanceBranchScope,
  requireMobileAttendanceClient,
} from './mobile-attendance-controller.helpers';

@ApiTags('Mobile Attendance — Enrollment')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/enrollment', version: '1' })
export class MobileAttendanceEnrollmentController {
  constructor(
    private readonly enrollmentService: EnrollmentService,
    private readonly reenrollmentService: ReenrollmentService,
  ) {}

  @ApiOperation({ summary: 'ESS — employee self-enroll from their phone' })
  @Post('self')
  @Roles('EMPLOYEE', 'CLIENT', 'ADMIN')
  selfEnroll(@CurrentUser() user: ReqUser, @Body() dto: SelfEnrollDto) {
    const clientId = requireMobileAttendanceClient(user);
    if (dto.subjectType === 'CONTRACTOR') {
      if (user?.roleCode === 'EMPLOYEE') {
        throw new ForbiddenException(
          'Contractor face enrollment must be performed by a client operator',
        );
      }
      if (!dto.contractorEmployeeId) {
        throw new BadRequestException('contractorEmployeeId required');
      }
      return this.enrollmentService.enrollContractorSelf(
        dto.contractorEmployeeId,
        clientId,
        user?.branchIds?.[0] ?? null,
        dto,
        user.userId,
      );
    }
    const employeeId = user?.employeeId ?? user?.userId;
    if (!employeeId)
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
    const clientId = requireMobileAttendanceClient(user);
    return this.enrollmentService.createKioskTicket(
      clientId,
      user?.branchIds?.[0] ?? null,
      dto,
      user.userId,
      mobileAttendanceBranchScope(user),
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
    const clientId = requireMobileAttendanceClient(user);
    return this.enrollmentService.listTickets(clientId, status);
  }

  @ApiOperation({ summary: 'Get a single enrollment ticket' })
  @Get('kiosk/tickets/:ticketId')
  @Roles('CLIENT', 'ADMIN')
  getTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: ReqUser) {
    const clientId = requireMobileAttendanceClient(user);
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
    const clientId = requireMobileAttendanceClient(user);
    const photo = await this.enrollmentService.getTicketPhoto(
      clientId,
      ticketId,
      mobileAttendanceBranchScope(user),
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
    const clientId = requireMobileAttendanceClient(user);
    return this.enrollmentService.deactivateEnrollment(
      clientId,
      dto,
      user.userId,
      mobileAttendanceBranchScope(user),
    );
  }

  @ApiOperation({ summary: 'Admin — list all active employee enrollments' })
  @Get('employees')
  @Roles('CLIENT', 'ADMIN')
  listEmployeeEnrollments(@CurrentUser() user: ReqUser) {
    const clientId = requireMobileAttendanceClient(user);
    return this.enrollmentService.listEmployeeEnrollments(
      clientId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Admin — list all contractor enrollments' })
  @Get('contractors')
  @Roles('CLIENT', 'ADMIN')
  listContractorEnrollments(@CurrentUser() user: ReqUser) {
    const clientId = requireMobileAttendanceClient(user);
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
    const clientId = requireMobileAttendanceClient(user);
    return this.enrollmentService.cancelKioskTicket(
      clientId,
      ticketId,
      user.userId,
    );
  }

  @ApiOperation({ summary: 'Admin — list employee re-enrollment requests' })
  @Get('reenroll-requests')
  @Roles('CLIENT', 'ADMIN')
  listReenrollRequests(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const normalized = (status ?? 'PENDING').toUpperCase() as
      | 'PENDING'
      | 'APPROVED'
      | 'REJECTED'
      | 'CANCELLED';
    return this.reenrollmentService.listEmployeeRequests(
      clientId,
      normalized,
      mobileAttendanceBranchScope(user),
    );
  }

  @ApiOperation({ summary: 'Admin — review an employee re-enrollment request' })
  @Post('reenroll-requests/:id/review')
  @Roles('CLIENT', 'ADMIN')
  reviewReenrollRequest(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Body() dto: ReviewReenrollDto,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.reenrollmentService.reviewEmployeeRequest(
      clientId,
      id,
      dto.decision,
      user.userId,
      dto.notes,
      mobileAttendanceBranchScope(user),
    );
  }

  @ApiOperation({
    summary: 'Stream a re-enrollment request photo (client + branch scoped)',
  })
  @Get('reenroll-requests/:id/photo')
  @Roles('CLIENT', 'ADMIN')
  async getReenrollRequestPhoto(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const photo = await this.reenrollmentService.getEmployeeRequestPhoto(
      clientId,
      id,
      mobileAttendanceBranchScope(user),
    );
    if (!photo?.buffer?.length) {
      throw new NotFoundException('Photo not found');
    }
    res.setHeader('Content-Type', photo.contentType);
    res.send(photo.buffer);
  }

  @ApiOperation({ summary: 'Admin — list contractor re-enrollment requests' })
  @Get('contractor-reenroll-requests')
  @Roles('CLIENT', 'ADMIN')
  listContractorReenrollRequests(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const normalized = (status ?? 'PENDING').toUpperCase() as
      | 'PENDING'
      | 'APPROVED'
      | 'REJECTED'
      | 'CANCELLED';
    return this.reenrollmentService.listContractorRequests(
      clientId,
      normalized,
      mobileAttendanceBranchScope(user),
    );
  }

  @ApiOperation({
    summary: 'Admin — review a contractor re-enrollment request',
  })
  @Post('contractor-reenroll-requests/:id/review')
  @Roles('CLIENT', 'ADMIN')
  reviewContractorReenrollRequest(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Body() dto: ReviewReenrollDto,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.reenrollmentService.reviewContractorRequest(
      clientId,
      id,
      dto.decision,
      user.userId,
      dto.notes,
      mobileAttendanceBranchScope(user),
    );
  }

  @ApiOperation({
    summary:
      'Stream a contractor re-enrollment request photo (client + branch scoped)',
  })
  @Get('contractor-reenroll-requests/:id/photo')
  @Roles('CLIENT', 'ADMIN')
  async getContractorReenrollRequestPhoto(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const photo = await this.reenrollmentService.getContractorRequestPhoto(
      clientId,
      id,
      mobileAttendanceBranchScope(user),
    );
    if (!photo?.buffer?.length) {
      throw new NotFoundException('Photo not found');
    }
    res.setHeader('Content-Type', photo.contentType);
    res.send(photo.buffer);
  }
}
