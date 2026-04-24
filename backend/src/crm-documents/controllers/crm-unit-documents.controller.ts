import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { CrmDocumentsService } from '../crm-documents.service';
import { UploadCrmDocumentDto } from '../dto/upload-crm-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

/**
 * CRM-only controller for unit document uploads.
 * Base: /api/v1/crm/unit-documents
 */
@ApiTags('CRM Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/unit-documents', version: '1' })
@Roles('CRM')
export class CrmUnitDocumentsController {
  constructor(private readonly svc: CrmDocumentsService) {}

  /** Upload a document for a unit */
  @ApiOperation({ summary: 'File Interceptor' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadCrmDocumentDto,
    @CurrentUser() user: ReqUser,
  ) {
    const doc = await this.svc.upload(dto, file, user.id);
    return {
      id: doc.id,
      fileName: doc.fileName,
      createdAt: doc.createdAt,
    };
  }

  /** List documents (CRM sees only assigned clients) */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.listForCrm(user.id, {
      clientId: query.clientId,
      branchId: query.branchId,
      scope: query.scope as 'COMPANY' | 'BRANCH' | undefined,
      month: query.month,
      lawCategory: query.lawCategory,
      documentType: query.documentType,
    });
  }

  /** Download a document */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id, user.id, 'CRM');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }

  /** Soft-delete a document (CRM can delete own uploads) */
  @ApiOperation({ summary: 'Remove' })
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    await this.svc.softDelete(id, user.id);
    return { deleted: true };
  }
}
