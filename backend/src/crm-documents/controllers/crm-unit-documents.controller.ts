import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { CrmDocumentsService } from '../crm-documents.service';
import { UploadCrmDocumentDto } from '../dto/upload-crm-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import {
  makeSafeUploadOptions,
  assertSafeFile,
} from '../../common/safe-upload';

const CRM_UNIT_DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.xls',
  '.xlsx',
  '.zip',
]);

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
    FilesInterceptor(
      'file',
      25,
      makeSafeUploadOptions({
        memory: true,
        maxMb: 10,
        maxFiles: 25,
        allowedMimes: [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/zip',
          'application/x-zip-compressed',
        ],
      }),
    ),
  )
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadCrmDocumentDto,
    @CurrentUser() user: ReqUser,
  ) {
    files = files || [];
    files.forEach((file) => assertSafeFile(file, CRM_UNIT_DOCUMENT_EXTENSIONS));
    const docs = await this.svc.uploadMany(dto, files, user.id);
    return {
      count: docs.length,
      documents: docs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        createdAt: doc.createdAt,
      })),
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
    @Param('id', ParseUUIDPipe) id: string,
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
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.svc.softDelete(id, user.id);
    return { deleted: true };
  }
}
