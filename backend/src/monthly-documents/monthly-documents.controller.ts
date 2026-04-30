import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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
import { UploadMonthlyDocumentDto } from './dto/upload-monthly-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

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
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.list(
      { id: user.id, clientId: user.clientId! },
      q.branchId,
      q.month,
      q.code || undefined,
    );
  }

  /** POST /api/v1/documents/monthly/upload  (multipart) */
  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @CurrentUser() user: ReqUser,
    @Body() body: UploadMonthlyDocumentDto,
    @UploadedFile() file: MulterFile,
  ) {
    return this.svc.upload(
      { id: user.id, clientId: user.clientId! },
      body.branchId,
      body.month,
      body.code,
      file,
    );
  }

  /** DELETE /api/v1/documents/monthly/:id */
  @ApiOperation({ summary: 'Remove' })
  @Delete(':id')
  remove(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.remove({ id: user.id, clientId: user.clientId! }, id);
  }
}
