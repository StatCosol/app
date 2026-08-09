import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import {
  AttendanceReviewFederationService,
  FederatedReviewQueue,
} from './punch/attendance-review-federation.service';
import { AttendanceReviewActionService } from './punch/attendance-review-action.service';
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
    private readonly reviewAction: AttendanceReviewActionService,
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

  @ApiOperation({
    summary:
      'Approve or reject a federated review item (mobile borderline or FaceDesk verification)',
  })
  @Post(':queue/:itemId/action')
  @Roles('CLIENT', 'ADMIN')
  async actOnFederatedItem(
    @CurrentUser() user: ReqUser,
    @Param('queue') queue: string,
    @Param('itemId') itemId: string,
    @Body()
    body: {
      action: 'APPROVE' | 'REJECT';
      note?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    },
  ) {
    const clientId = requireMobileAttendanceClient(user);
    await this.entitlements.assertAnyModule(clientId, [
      'MOBILE_ATTENDANCE',
      'CONTRACTOR_FACE_ATTENDANCE',
    ]);
    const normalizedQueue = String(queue || '').toUpperCase();
    if (
      normalizedQueue !== 'MOBILE_BORDERLINE' &&
      normalizedQueue !== 'FACEDESK_VERIFICATION'
    ) {
      throw new BadRequestException(
        'queue must be MOBILE_BORDERLINE or FACEDESK_VERIFICATION',
      );
    }
    if (normalizedQueue === 'MOBILE_BORDERLINE') {
      await this.entitlements.assertModule(clientId, 'MOBILE_ATTENDANCE');
    }
    if (normalizedQueue === 'FACEDESK_VERIFICATION') {
      await this.entitlements.assertModule(
        clientId,
        'CONTRACTOR_FACE_ATTENDANCE',
      );
    }
    const branchIds = mobileAttendanceBranchScope(user);
    return this.reviewAction.actOnFederatedItem(
      clientId,
      normalizedQueue as FederatedReviewQueue,
      itemId,
      user.id,
      body,
      branchIds,
    );
  }
}
