import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
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
@Roles('CLIENT')
export class BranchUnitDocumentsController {
  constructor(
    private readonly svc: CrmDocumentsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** List CRM-uploaded docs for my unit(s) */
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
