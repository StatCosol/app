import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
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
import type { ContractorDocumentCreateDto } from './contractor-documents.service';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

const storage = diskStorage({
  destination: (req, file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'contractor-documents');
    ensureDir(base);
    cb(null, base);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const fileUploadOptions = {
  storage,
  fileFilter: (req: any, file: any, cb: any) => {
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

@Controller('api/contractor/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDocumentsController {
  constructor(private readonly svc: ContractorDocumentsService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.contractorList(req.user, q);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  upload(
    @Req() req: any,
    @Body() dto: ContractorDocumentCreateDto,
    @UploadedFile() file: any,
  ) {
    return this.svc.contractorUpload(req.user, dto, file);
  }
}

@Controller('api/crm/contractor-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM', 'ADMIN', 'CCO', 'CEO', 'AUDITOR')
export class CrmContractorDocumentsController {
  constructor(private readonly svc: ContractorDocumentsService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    // NOTE: clientId is required; authorization checks can be tightened later
    return this.svc.listByClient(req.user, q);
  }
}
