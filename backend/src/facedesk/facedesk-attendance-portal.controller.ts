import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { assertFaceDeskJwtPunchAllowed } from './facedesk-jwt-punch.util';
import { MarkAttendanceDto, OfflineSyncDto } from './facedesk.dto';
import { requireFaceDeskClient } from './facedesk-controller.helpers';

@ApiTags('FaceDesk V2')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk', version: '1' })
export class FaceDeskAttendancePortalController {
  constructor(private readonly attendance: FaceDeskAttendanceService) {}

  @ApiOperation({ summary: 'Mark attendance from captured frames' })
  @Post('attendance/mark')
  @Roles('CLIENT', 'ADMIN', 'EMPLOYEE')
  mark(@CurrentUser() user: ReqUser, @Body() dto: MarkAttendanceDto) {
    assertFaceDeskJwtPunchAllowed();
    return this.attendance.markAttendance(
      requireFaceDeskClient(user),
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
    return this.attendance.getStatus(requireFaceDeskClient(user), employeeId);
  }

  @ApiOperation({ summary: 'Offline attendance batch sync' })
  @Post('attendance/offline-sync')
  @Roles('CLIENT', 'ADMIN')
  offlineSync(@CurrentUser() user: ReqUser, @Body() dto: OfflineSyncDto) {
    assertFaceDeskJwtPunchAllowed();
    return this.attendance.offlineSync(
      requireFaceDeskClient(user),
      user?.branchIds?.[0] ?? null,
      null,
      dto.punches,
    );
  }
}
