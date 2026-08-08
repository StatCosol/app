import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';
import { FaceDeskTicketService } from './facedesk-ticket.service';
import {
  CheckDuplicateDto,
  CreateEnrollTicketDto,
  SaveEnrollmentDto,
  SetAttendancePinDto,
  ValidateQualityDto,
} from './facedesk.dto';
import {
  facedeskBranchScope,
  facedeskSubjectType,
  requireFaceDeskClient,
} from './facedesk-controller.helpers';

@ApiTags('FaceDesk V2')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk', version: '1' })
export class FaceDeskEnrollmentController {
  constructor(
    private readonly enrollment: FaceDeskEnrollmentService,
    private readonly tickets: FaceDeskTicketService,
  ) {}

  @ApiOperation({ summary: 'Pending employees for enrollment' })
  @Get('enrollment/pending')
  @Roles('CLIENT', 'ADMIN')
  pending(
    @CurrentUser() user: ReqUser,
    @Query('subjectType') subjectType?: string,
  ) {
    return this.enrollment.getPendingEmployees(
      requireFaceDeskClient(user),
      facedeskBranchScope(user) ?? [],
      facedeskSubjectType(subjectType),
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
      requireFaceDeskClient(user),
      facedeskBranchScope(user),
      facedeskSubjectType(subjectType),
    );
  }

  @ApiOperation({ summary: 'Validate captured face quality' })
  @Post('enrollment/validate-quality')
  @Roles('CLIENT', 'ADMIN')
  validateQuality(
    @CurrentUser() user: ReqUser,
    @Body() dto: ValidateQualityDto,
  ) {
    requireFaceDeskClient(user);
    return this.enrollment.validateQuality(dto);
  }

  @ApiOperation({ summary: 'Check duplicate face before saving' })
  @Post('enrollment/check-duplicate')
  @Roles('CLIENT', 'ADMIN')
  checkDuplicate(@CurrentUser() user: ReqUser, @Body() dto: CheckDuplicateDto) {
    return this.enrollment.checkDuplicate(requireFaceDeskClient(user), dto);
  }

  @ApiOperation({ summary: 'Save face profile (min-N samples)' })
  @Post('enrollment/save')
  @Roles('CLIENT', 'ADMIN')
  enroll(@CurrentUser() user: ReqUser, @Body() dto: SaveEnrollmentDto) {
    return this.enrollment.saveProfile(
      requireFaceDeskClient(user),
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
      requireFaceDeskClient(user),
      user?.branchIds?.[0] ?? null,
      user.id,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Delete a FaceDesk enrollment (face profile + samples)',
  })
  @Delete('enrollment/:employeeId')
  @Roles('CLIENT', 'ADMIN')
  deleteEnrollment(
    @CurrentUser() user: ReqUser,
    @Param('employeeId') employeeId: string,
    @Query('subjectType') subjectType?: string,
  ) {
    return this.enrollment.deleteEnrollment(
      requireFaceDeskClient(user),
      user.id,
      employeeId,
      facedeskSubjectType(subjectType),
      facedeskBranchScope(user),
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
      requireFaceDeskClient(user),
      user.id,
      { employeeId: dto?.employeeId, employeeCode: dto?.employeeCode },
      dto?.pin,
      facedeskBranchScope(user) ?? undefined,
    );
  }

  @ApiOperation({ summary: 'Create an enrollment ticket for a kiosk' })
  @Post('enroll-tickets')
  @Roles('CLIENT', 'ADMIN')
  createEnrollTicket(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateEnrollTicketDto,
  ) {
    return this.tickets.create(
      requireFaceDeskClient(user),
      user.id,
      dto,
      facedeskBranchScope(user),
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
      requireFaceDeskClient(user),
      status,
      facedeskBranchScope(user),
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
      requireFaceDeskClient(user),
      ticketId,
      facedeskBranchScope(user),
    );
  }
}
