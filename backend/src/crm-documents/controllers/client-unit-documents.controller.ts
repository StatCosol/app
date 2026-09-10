import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { BranchAccessService } from '../../auth/branch-access.service';
import { CrmDocumentsService } from '../crm-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';

/**
 * Client master controller for viewing CRM-uploaded unit documents.
 * Base: /api/v1/client/unit-documents
 */
@ApiTags('CRM Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/unit-documents', version: '1' })
@Roles('CLIENT')
export class ClientUnitDocumentsController {
  constructor(
    private readonly svc: CrmDocumentsService,
    private readonly branchAccess: BranchAccessService,
    private readonly scope: AccessScopeService,
  ) {}

  /**
   * Branch users reach this controller too, and must not be widened by it.
   *
   * A branch user's roleCode is CLIENT — only userType tells them apart — so
   * @Roles('CLIENT') admits both. This endpoint filtered by client alone, and
   * the download checked only that the document belonged to the caller's
   * client, so a branch user who called /client/unit-documents instead of
   * /branch/unit-documents saw and downloaded every branch's documents in the
   * company. The branch controller's own comment says the client endpoint is
   * for master users; nothing enforced it.
   *
   * getScope() is the same classification the rest of the API uses: 'branches'
   * for a branch user, 'client' for a master.
   */
  private async branchScopeOf(user: ReqUser): Promise<string[] | null> {
    const scope = await this.scope.getScope(user);
    return scope.level === 'branches' ? (scope.branchIds ?? []) : null;
  }

  /** List CRM-uploaded docs for my company (all units) */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const clientId = user.clientId;
    if (!clientId) return [];

    const branchIds = await this.branchScopeOf(user);
    if (branchIds) {
      // Delegate to the branch-scoped listing rather than adding a second set
      // of rules here: it already handles company-scoped documents and an
      // empty mapping list, and two implementations is how this went wrong.
      if (query.branchId && !branchIds.includes(query.branchId)) {
        throw new ForbiddenException('You do not have access to this branch');
      }
      return this.svc.listForBranch(
        query.branchId ? [query.branchId] : branchIds,
        {
          scope: query.scope as 'COMPANY' | 'BRANCH' | undefined,
          month: query.month,
          lawCategory: query.lawCategory,
          documentType: query.documentType,
        },
      );
    }

    if (query.branchId) {
      await this.branchAccess.assertBranchAccess(user.userId, query.branchId);
    }
    return this.svc.listForClient(clientId, {
      branchId: query.branchId,
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
    const branchIds = await this.branchScopeOf(user);

    // A branch user is checked as a branch user here, exactly as they would be
    // on /branch/unit-documents. An empty mapping list denies both
    // branch-scoped and company-scoped documents, which is the closed door.
    const { absolutePath, fileName, mimeType } = branchIds
      ? await this.svc.getDocumentForDownload(id, user.id, 'BRANCH_USER', {
          allowedBranchIds: branchIds,
          allowedClientIds: await this.svc.getClientIdsForBranchIds(branchIds),
        })
      : await this.svc.getDocumentForDownload(id, user.id, 'CLIENT', {
          clientId: user.clientId!,
        });

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }
}
