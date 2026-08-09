import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskAdminService } from './facedesk-admin.service';
import {
  DuplicateActionDto,
  ManualCorrectionDto,
  ReviewActionDto,
} from './facedesk.dto';
import {
  facedeskBranchScope,
  facedeskVerificationPhotosAllowed,
  requireFaceDeskBranchVerifier,
  requireFaceDeskClient,
  requireFaceDeskClientAdmin,
} from './facedesk-controller.helpers';

@ApiTags('FaceDesk V2')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk', version: '1' })
export class FaceDeskAdminController {
  constructor(private readonly admin: FaceDeskAdminService) {}

  @ApiOperation({ summary: 'List duplicate alerts' })
  @Get('admin/duplicate-alerts')
  @Roles('CLIENT', 'ADMIN')
  duplicateAlerts(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    return this.admin.listDuplicateAlerts(
      requireFaceDeskClientAdmin(user),
      status,
    );
  }

  @ApiOperation({ summary: 'Approve/reject a duplicate alert' })
  @Post('admin/duplicate-alerts/:alertId/action')
  @Roles('CLIENT', 'ADMIN')
  duplicateAction(
    @CurrentUser() user: ReqUser,
    @Param('alertId') alertId: string,
    @Body() dto: DuplicateActionDto,
  ) {
    return this.admin.actOnDuplicate(
      requireFaceDeskClientAdmin(user),
      alertId,
      user.id,
      dto,
    );
  }

  @ApiOperation({ summary: 'List review queue' })
  @Get('admin/review-queue')
  @Roles('CLIENT', 'ADMIN')
  async reviewQueue(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    const rows = await this.admin.listReviewQueue(
      requireFaceDeskClient(user),
      status,
      facedeskBranchScope(user),
    );
    if (!facedeskVerificationPhotosAllowed(user)) {
      return rows.map((row: Record<string, unknown>) => ({
        ...row,
        photoUrl: null,
        hasEnrolledPhoto: false,
      }));
    }
    return rows;
  }

  @ApiOperation({ summary: 'Act on a review item' })
  @Post('admin/review-queue/:reviewId/action')
  @Roles('CLIENT', 'ADMIN')
  reviewAction(
    @CurrentUser() user: ReqUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReviewActionDto,
  ) {
    return this.admin.actOnReview(
      requireFaceDeskClient(user),
      reviewId,
      user.id,
      dto,
      facedeskBranchScope(user),
    );
  }

  @ApiOperation({ summary: 'Scoped captured photo for a review item' })
  @Get('admin/review-queue/:reviewId/photo')
  @Roles('CLIENT', 'ADMIN')
  async reviewPhoto(
    @CurrentUser() user: ReqUser,
    @Param('reviewId') reviewId: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.admin.getReviewPhoto(
      requireFaceDeskClient(user),
      reviewId,
      requireFaceDeskBranchVerifier(user),
    );
    if (!photo) throw new NotFoundException('Photo not available');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.buffer);
  }

  @ApiOperation({
    summary: 'Scoped enrolled reference photo for a review item',
  })
  @Get('admin/review-queue/:reviewId/enrollment-photo')
  @Roles('CLIENT', 'ADMIN')
  async reviewEnrollmentPhoto(
    @CurrentUser() user: ReqUser,
    @Param('reviewId') reviewId: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.admin.getReviewEnrollmentPhoto(
      requireFaceDeskClient(user),
      reviewId,
      requireFaceDeskBranchVerifier(user),
    );
    if (!photo) throw new NotFoundException('Enrollment photo not available');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.buffer);
  }

  @ApiOperation({ summary: 'Request a manual attendance correction' })
  @Post('admin/corrections')
  @Roles('CLIENT', 'ADMIN')
  createCorrection(
    @CurrentUser() user: ReqUser,
    @Body() dto: ManualCorrectionDto,
  ) {
    return this.admin.createCorrection(
      requireFaceDeskClient(user),
      user?.branchIds?.[0] ?? null,
      user.id,
      dto,
    );
  }

  @ApiOperation({ summary: 'Approve/reject a manual correction' })
  @Post('admin/corrections/:correctionId/action')
  @Roles('CLIENT', 'ADMIN')
  actCorrection(
    @CurrentUser() user: ReqUser,
    @Param('correctionId') correctionId: string,
    @Body() body: { approve: boolean },
  ) {
    return this.admin.approveCorrection(
      requireFaceDeskClient(user),
      correctionId,
      user.id,
      body?.approve === true,
    );
  }
}
