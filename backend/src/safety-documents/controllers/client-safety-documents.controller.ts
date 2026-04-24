import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { SafetyDocumentsService } from '../safety-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

/**
 * Client user controller for viewing safety documents (read-only).
 * Base: /api/v1/client/safety-documents
 */
@ApiTags('Safety Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/safety-documents', version: '1' })
@Roles('CLIENT')
export class ClientSafetyDocumentsController {
  constructor(private readonly svc: SafetyDocumentsService) {}

  /** Get master categories */
  @ApiOperation({ summary: 'Get Categories' })
  @Get('categories')
  async getCategories() {
    return this.svc.getMasterCategories();
  }

  /** Get Safety Risk Score for client */
  @ApiOperation({ summary: 'Get Safety Score' })
  @Get('safety-score')
  async getSafetyScore(@CurrentUser() user: ReqUser) {
    const clientId = user.clientId;
    if (!clientId) return { overallScore: 0, categoryScores: [] };
    return this.svc.getSafetyScore({ clientId });
  }

  /** List all safety documents for the client */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const clientId = user.clientId;
    if (!clientId) return [];
    return this.svc.listForClient(clientId, {
      branchId: query.branchId,
      documentType: query.documentType,
      category: query.category,
      frequency: query.frequency,
    });
  }

  /** Get documents expiring soon */
  @ApiOperation({ summary: 'Get Expiring' })
  @Get('expiring')
  async getExpiring(@CurrentUser() user: ReqUser) {
    const clientId = user.clientId;
    if (!clientId) return [];
    return this.svc.getExpiringDocuments({ clientId });
  }

  /** Download a safety document */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const clientId = user.clientId;
    const doc = await this.svc.getDocumentEntity(id);

    if (doc.clientId !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }
}
