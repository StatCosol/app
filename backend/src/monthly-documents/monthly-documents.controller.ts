import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MonthlyDocumentsService } from './monthly-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

type MulterFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
};

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
};

@ApiTags('Compliance Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'documents/monthly', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class MonthlyDocumentsController {
  constructor(private readonly svc: MonthlyDocumentsService) {}

  /** GET /api/v1/documents/monthly?branchId=&month=&code= */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.list(
      { id: req.user.id, clientId: req.user.clientId },
      q.branchId,
      q.month,
      q.code || undefined,
    );
  }

  /** POST /api/v1/documents/monthly/upload  (multipart) */
  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(@Req() req: any, @Body() body: any, @UploadedFile() file: MulterFile) {
    return this.svc.upload(
      { id: req.user.id, clientId: req.user.clientId },
      body.branchId,
      body.month,
      body.code,
      file,
    );
  }

  /** DELETE /api/v1/documents/monthly/:id */
  @ApiOperation({ summary: 'Remove' })
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(
      { id: req.user.id, clientId: req.user.clientId },
      id,
    );
  }
}
