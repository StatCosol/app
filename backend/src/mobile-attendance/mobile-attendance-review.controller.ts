import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { AttendanceReviewFederationService } from './punch/attendance-review-federation.service';
import {
  mobileAttendanceBranchScope,
  requireMobileAttendanceClient,
} from './mobile-attendance-controller.helpers';

@ApiTags('Mobile Attendance — Review')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/review-federation', version: '1' })
export class MobileAttendanceReviewController {
  constructor(
    private readonly federation: AttendanceReviewFederationService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  @ApiOperation({
    summary:
      'Federated face-attendance review queue (mobile borderline + FaceDesk verification)',
  })
  @Get()
  @Roles('CLIENT', 'ADMIN')
  async listFederated(
    @CurrentUser() user: ReqUser,
    @Query('mobileStatus') mobileStatus?: string,
    @Query('facedeskStatus') facedeskStatus?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    await this.entitlements.assertAnyModule(clientId, [
      'MOBILE_ATTENDANCE',
      'CONTRACTOR_FACE_ATTENDANCE',
    ]);
    const [includeMobile, includeFacedesk] = await Promise.all([
      this.entitlements.hasModule(clientId, 'MOBILE_ATTENDANCE'),
      this.entitlements.hasModule(clientId, 'CONTRACTOR_FACE_ATTENDANCE'),
    ]);
    const branchIds = mobileAttendanceBranchScope(user);
    return this.federation.listFederated(clientId, {
      includeMobile,
      includeFacedesk,
      branchIds,
      mobileStatus,
      facedeskStatus,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
