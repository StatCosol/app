import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { BranchAccessService } from '../../auth/branch-access.service';
import { CrmDocumentsService } from '../crm-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

/**
 * Client Master (LegitX) controller for viewing CRM-uploaded unit documents.
 * Base: /api/v1/client/unit-documents
 *
 * Uses token's clientId — cannot pass arbitrary clientId.
 */
@ApiTags('CRM Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/unit-documents', version: '1' })
@Roles('CLIENT')
export class ClientUnitDocumentsController {
  constructor(
    private readonly svc: CrmDocumentsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** List CRM-uploaded docs for my company (all units) */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const clientId = user.clientId;
    if (!clientId) return [];
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
    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id, user.id, 'CLIENT', {
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
