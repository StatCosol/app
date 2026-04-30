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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ComplianceDocumentsService } from './compliance-documents.service';
import { UploadComplianceDocumentDto } from './dto/upload-compliance-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { CacheControl } from '../common/decorators/cache-control.decorator';

@ApiTags('Compliance Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminComplianceDocsController {
  constructor(private readonly svc: ComplianceDocumentsService) {}

  /** Upload a compliance document for any client */
  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadComplianceDocumentDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.svc.upload(dto, file, user.id, 'ADMIN');
  }

  /** List documents for any client */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@Query() query: Record<string, string>) {
    return this.svc.listForAdmin({
      clientId: query.clientId,
      branchId: query.branchId,
      category: query.category,
      subCategory: query.subCategory,
      periodYear: query.periodYear ? +query.periodYear : undefined,
      periodMonth: query.periodMonth ? +query.periodMonth : undefined,
      search: query.search,
    });
  }

  /** Get document categories catalog */
  @ApiOperation({ summary: 'Get Categories' })
  @Get('categories')
  @CacheControl(600)
  getCategories() {
    return this.svc.getCategories();
  }

  /** Get sub-categories for a given category */
  @ApiOperation({ summary: 'Get Sub Categories' })
  @Get('categories/:category/sub')
  @CacheControl(600)
  getSubCategories(@Param('category') category: string) {
    return this.svc.getSubCategories(category);
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
      await this.svc.getDocumentForDownload(id, user.id, 'ADMIN');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }

  /** Soft delete a document */
  @ApiOperation({ summary: 'Remove' })
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    await this.svc.softDelete(id, user.id);
    return { message: 'Document deleted' };
  }
}
