import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { BranchAccessService } from '../../auth/branch-access.service';
import { CrmDocumentsService } from '../crm-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
  async list(@Req() req: any, @Query() query: any) {
    const clientId = req.user.clientId;
    if (!clientId) return [];
    if (query.branchId) {
      await this.branchAccess.assertBranchAccess(
        req.user.userId,
        query.branchId,
      );
    }
    return this.svc.listForClient(clientId, {
      branchId: query.branchId,
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
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id, req.user.id, 'CLIENT', {
        clientId: req.user.clientId,
      });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }
}
