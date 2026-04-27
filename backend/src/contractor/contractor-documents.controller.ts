import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorDocumentsService } from './contractor-documents.service';
import type {
  ContractorDocumentCreateDto,
  ContractorDocumentReuploadDto,
} from './contractor-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'contractor-documents');
    ensureDir(base);
    cb(null, base);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const fileUploadOptions = {
  storage,
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new BadRequestException('File type not allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_MB * 1024 * 1024 },
};

@ApiTags('Contractor')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDocumentsController {
  constructor(private readonly svc: ContractorDocumentsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.contractorList(user, q);
  }

  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  upload(
    @CurrentUser() user: ReqUser,
    @Body() dto: ContractorDocumentCreateDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.contractorUpload(user, dto, file);
  }

  @ApiOperation({ summary: 'Reupload' })
  @Post('reupload/:id')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reupload(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: ContractorDocumentReuploadDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.contractorReupload(user, id, dto, file);
  }
}
