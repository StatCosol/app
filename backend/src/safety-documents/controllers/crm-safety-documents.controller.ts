import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { SafetyDocumentsService } from '../safety-documents.service';
import { UploadSafetyDocumentDto } from '../dto/upload-safety-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

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
  async list(
    @CurrentUser() _user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    if (!query.clientId) {
      throw new BadRequestException('clientId is required');
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
  async verify(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.svc.verifyCrm(id, user.id);
  }

  /** CRM uploads a safety document on behalf of a branch */
  @ApiOperation({ summary: 'Upload On Behalf' })
  @Post('upload-on-behalf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadOnBehalf(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadSafetyDocumentDto & { clientId: string },
    @CurrentUser() user: ReqUser,
  ) {
    const clientId = dto.clientId;
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // Verify CRM is assigned to this client
    await this.svc.assertCrmAssigned(clientId, user.id);
    const doc = await this.svc.upload(dto, file, user.id, clientId);
    return {
      id: doc.id,
      fileName: doc.fileName,
      documentName: doc.documentName,
      category: doc.category,
      frequency: doc.frequency,
      createdAt: doc.createdAt,
    };
  }

  /** Download a safety document (CRM access-checked) */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    // Verify document belongs to a client assigned to this CRM
    const doc = await this.svc.getDocumentEntity(id);
    await this.svc.assertCrmAssigned(doc.clientId, user.id);
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
