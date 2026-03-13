import {
  BadRequestException,
  Body,
  Controller,
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
  ContractorDocumentReviewDto,
} from './contractor-documents.service';
import {
  ClientScoped,
  CrmAssignmentGuard,
} from '../assignments/crm-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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

@ApiTags('Contractor')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDocumentsController {
  constructor(private readonly svc: ContractorDocumentsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.contractorList(req.user, q);
  }

  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  upload(
    @Req() req: any,
    @Body() dto: ContractorDocumentCreateDto,
    @UploadedFile() file: any,
  ) {
    return this.svc.contractorUpload(req.user, dto, file);
  }

  @ApiOperation({ summary: 'Reupload' })
  @Post('reupload/:id')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reupload(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ContractorDocumentReuploadDto,
    @UploadedFile() file: any,
  ) {
    return this.svc.contractorReupload(req.user, id, dto, file);
  }
}

@Controller({ path: 'crm/contractor-documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, CrmAssignmentGuard)
@Roles('CRM', 'ADMIN', 'CCO', 'CEO', 'AUDITOR')
export class CrmContractorDocumentsController {
  constructor(private readonly svc: ContractorDocumentsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  @ClientScoped('clientId')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listByClient(req.user, q);
  }

  @ApiOperation({ summary: 'Review' })
  @Post(':id/review')
  review(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ContractorDocumentReviewDto,
  ) {
    return this.svc.reviewDocument(req.user, id, dto);
  }
}
