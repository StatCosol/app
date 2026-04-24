import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeeDocumentService } from './employee-document.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'employees/documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeDocumentController {
  constructor(private readonly docService: EmployeeDocumentService) {}

  @ApiOperation({ summary: 'File Interceptor' })
  @Post(':employeeId/upload')
  @Roles('CLIENT', 'ADMIN', 'CRM')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'employee-documents');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
          );
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async upload(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
    @Body('docName') docName: string,
    @Body('expiryDate') expiryDate: string | undefined,
    @CurrentUser() user: ReqUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!docType) throw new BadRequestException('docType is required');

    return this.docService.upload({
      clientId: user.clientId!,
      employeeId,
      docType,
      docName: docName || file.originalname,
      fileName: file.filename,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedByUserId: user.userId,
      expiryDate,
    });
  }

  @ApiOperation({ summary: 'List' })
  @Get(':employeeId')
  @Roles('CLIENT', 'ADMIN', 'CRM')
  list(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.docService.listForEmployee(user.clientId!, employeeId);
  }

  @ApiOperation({ summary: 'Download' })
  @Get('download/:id')
  @Roles('CLIENT', 'ADMIN', 'CRM')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const doc = await this.docService.findById(id);
    if (!fs.existsSync(doc.filePath)) {
      throw new BadRequestException('File not found on disk');
    }
    res.download(doc.filePath, doc.docName || doc.fileName);
  }

  @ApiOperation({ summary: 'Verify' })
  @Post(':id/verify')
  @Roles('CLIENT', 'ADMIN')
  verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: ReqUser) {
    return this.docService.verify(id, user.userId);
  }

  @ApiOperation({ summary: 'Remove' })
  @Delete(':id')
  @Roles('CLIENT', 'ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.docService.remove(id);
  }
}
