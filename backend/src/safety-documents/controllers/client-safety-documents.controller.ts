import {
  ForbiddenException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { AccessScopeService } from '../../access/access-scope.service';
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
  constructor(
    private readonly svc: SafetyDocumentsService,
    private readonly scope: AccessScopeService,
  ) {}

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

    // Same gap as the download: a branch user reaching this endpoint listed
    // every branch in the company. Narrow them to their own, and refuse a
    // filter for a branch they do not hold rather than answering emptily.
    const scope = await this.scope.getScope(user);
    const branchIds =
      scope.level === 'branches' ? (scope.branchIds ?? []) : undefined;
    if (branchIds && query.branchId && !branchIds.includes(query.branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }

    return this.svc.listForClient(clientId, {
      branchId: query.branchId,
      branchIds,
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
    // Compared clientId alone, and a branch user's roleCode is CLIENT — so a
    // branch user could download any branch's document in the company.
    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id, user);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }
}
