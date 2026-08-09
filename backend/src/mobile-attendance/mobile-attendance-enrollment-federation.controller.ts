import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { FaceEnrollmentFederationService } from './enrollment/face-enrollment-federation.service';
import {
  mobileAttendanceBranchScope,
  requireMobileAttendanceClient,
} from './mobile-attendance-controller.helpers';

@ApiTags('Mobile Attendance — Enrollment')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/enrollment-federation', version: '1' })
export class MobileAttendanceEnrollmentFederationController {
  constructor(
    private readonly federation: FaceEnrollmentFederationService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  @ApiOperation({
    summary:
      'Federated employee face-enrollment status (mobile ESS + FaceDesk kiosk)',
  })
  @Get()
  @Roles('CLIENT', 'ADMIN')
  async listFederated(
    @CurrentUser() user: ReqUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
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
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
  }
}
