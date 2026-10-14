import {
  Body,
  Controller,
  ForbiddenException,
  ParseUUIDPipe,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadCrmDocumentDto } from '../dto/upload-crm-document.dto';
import {
  assertSafeFile,
  makeSafeUploadOptions,
} from '../../common/safe-upload';
import { Roles } from '../../auth/roles.decorator';
import { BranchAccessService } from '../../auth/branch-access.service';
import { CrmDocumentsService } from '../crm-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

/**
 * Branch/Unit user controller for viewing CRM-uploaded unit documents.
 * Base: /api/v1/branch/unit-documents
 *
 * Enforces branch-level access: user can only see docs for their mapped unit(s).
 */
@ApiTags('CRM Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/unit-documents', version: '1' })
@Roles('CLIENT', 'BRANCH', 'BRANCH_DESK')
export class BranchUnitDocumentsController {
  constructor(
    private readonly svc: CrmDocumentsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Get('registrations')
  async registrations(
    @CurrentUser() user: ReqUser,
    @Query('branchId', ParseUUIDPipe) branchId: string,
  ) {
    const branches = await this.branchAccess.getUserBranchIds(
      user.userId ?? user.id,
    );
    if (!user.clientId || !branches.includes(branchId))
      throw new ForbiddenException('Branch not in scope');
    return this.svc.registrationOptions(user.clientId, branchId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor(
      'file',
      makeSafeUploadOptions({
        memory: true,
        maxMb: 10,
        allowedMimes: [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/zip',
          'application/x-zip-compressed',
        ],
      }),
    ),
  )
  async upload(
    @CurrentUser() user: ReqUser,
    @Body() dto: UploadCrmDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file, true);
    const branchIds = await this.branchAccess.getUserBranchIds(
      user.userId ?? user.id,
    );
    return this.svc.uploadForBranch(
      dto,
      file,
      user.userId ?? user.id,
      user.clientId,
      branchIds,
    );
  }

  /** List shared unit documents for my unit(s) */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const userId = user.id;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);

    // If master user (no branch mapping), let them use the client endpoint instead
    if (!branchIds.length) {
      return [];
    }

    return this.svc.listForBranch(branchIds, {
      scope: query.scope as 'COMPANY' | 'BRANCH' | undefined,
      month: query.month,
      lawCategory: query.lawCategory,
      documentType: query.documentType,
    });
  }

  /** Download a CRM-uploaded document */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const userId = user.id;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);
    const allowed = branchIds.length ? branchIds : ('ALL' as const);
    const clientIds = await this.svc.getClientIdsForBranchIds(branchIds);

    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id, userId, 'BRANCH_USER', {
        allowedBranchIds: allowed,
        allowedClientIds: clientIds,
      });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }
}
