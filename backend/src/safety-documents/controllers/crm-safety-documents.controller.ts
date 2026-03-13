import { Controller, Get, Param, Patch, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { SafetyDocumentsService } from '../safety-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * CRM controller for viewing and verifying safety documents.
 * Base: /api/v1/crm/safety-documents
 */
@ApiTags('Safety Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/safety-documents', version: '1' })
@Roles('CRM')
export class CrmSafetyDocumentsController {
  constructor(private readonly svc: SafetyDocumentsService) {}

  /** Get master categories */
  @ApiOperation({ summary: 'Get Categories' })
  @Get('categories')
  async getCategories() {
    return this.svc.getMasterCategories();
  }

  /** Get Safety Risk Score for a client */
  @ApiOperation({ summary: 'Get Safety Score' })
  @Get('safety-score')
  async getSafetyScore(@Query('clientId') clientId: string) {
    if (!clientId) return { overallScore: 0, categoryScores: [] };
    return this.svc.getSafetyScore({ clientId });
  }

  /** List safety documents for a specific client */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@Req() req: any, @Query() query: any) {
    if (!query.clientId) {
      return { error: 'clientId is required' };
    }
    return this.svc.listForCrm(query.clientId, {
      branchId: query.branchId,
      documentType: query.documentType,
      category: query.category,
      frequency: query.frequency,
    });
  }

  /** Get expiring documents for a client */
  @ApiOperation({ summary: 'Get Expiring' })
  @Get('expiring')
  async getExpiring(@Query('clientId') clientId: string) {
    if (!clientId) return [];
    return this.svc.getExpiringDocuments({ clientId });
  }

  /** CRM verifies a safety document */
  @ApiOperation({ summary: 'Verify' })
  @Patch(':id/verify')
  async verify(@Param('id') id: string, @Req() req: any) {
    return this.svc.verifyCrm(id, req.user.id);
  }

  /** Download a safety document */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
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
