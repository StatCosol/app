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
  DayReviewActionDto,
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
    // Both a company admin and a branch verifier may list duplicate alerts.
    // Branch verifiers are scoped to their own branches (and are the only role
    // allowed to see the biometric faces); a company admin sees every alert but
    // no photos. requireFaceDeskClient throws synchronously for a bad context,
    // so keep it out of the async chain.
    const clientId = requireFaceDeskClient(user);
    const branchScope = facedeskBranchScope(user);
    const photosAllowed = facedeskVerificationPhotosAllowed(user);
    return this.admin
      .listDuplicateAlerts(clientId, status, branchScope)
      .then((rows: Array<Record<string, unknown>>) =>
        // Biometric faces are viewable only by branch verifiers — strip the
        // photo availability flags for everyone else so the UI doesn't offer a
        // "View face" link the scoped photo endpoint would reject.
        photosAllowed
          ? rows
          : rows.map((row) => ({
              ...row,
              hasNewPhoto: false,
              hasMatchedPhoto: false,
            })),
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

  @ApiOperation({ summary: 'Short (<full-day) worked days pending branch review' })
  @Get('admin/day-reviews')
  @Roles('CLIENT', 'ADMIN')
  dayReviews(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.listShortDayReviews(requireFaceDeskClient(user), {
      from,
      to,
      branchIds: facedeskBranchScope(user),
    });
  }

  @ApiOperation({ summary: 'Approve/reject a short worked day' })
  @Post('admin/day-reviews/action')
  @Roles('CLIENT', 'ADMIN')
  dayReviewAction(
    @CurrentUser() user: ReqUser,
    @Body() dto: DayReviewActionDto,
  ) {
    return this.admin.actOnDayReview(
      requireFaceDeskClient(user),
      user.id,
      dto,
      facedeskBranchScope(user),
    );
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

  @ApiOperation({
    summary: "Backfill the client's Azure face list from existing enrolments",
  })
  @Post('admin/azure/backfill')
  @Roles('CLIENT', 'ADMIN')
  backfillAzureFaceList(
    @CurrentUser() user: ReqUser,
    @Body() body: { cursor?: string; limit?: number },
  ) {
    // Client-admin only: this spends Azure transactions and rewrites biometric
    // linkage for the whole client, so a branch-scoped verifier must not run
    // it. requireFaceDeskClientAdmin also pins it to the caller's own client,
    // keeping the backfill inside one tenant.
    return this.admin.backfillAzureFaceList(requireFaceDeskClientAdmin(user), {
      cursor: body?.cursor,
      limit: body?.limit,
    });
  }
}
