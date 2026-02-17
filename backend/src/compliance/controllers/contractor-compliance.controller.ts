import {
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
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

const storage = diskStorage({
  destination: (req, file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'compliance');
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

@Controller({ path: 'contractor/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  private forbidden() {
    throw new ForbiddenException(
      'Contractor compliance workflow is disabled; use audit endpoints',
    );
  }

  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    this.forbidden();
  }

  @Get('tasks/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    this.forbidden();
  }

  @Post('tasks/:id/start')
  start(@Req() req: any, @Param('id') id: string) {
    this.forbidden();
  }

  @Post('tasks/:id/submit')
  submit(@Req() req: any, @Param('id') id: string) {
    this.forbidden();
  }

  @Post('tasks/:id/comment')
  comment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { message: string },
  ) {
    this.forbidden();
  }

  @Post('tasks/:id/evidence')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  uploadEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: { notes?: string },
  ) {
    this.forbidden();
  }

  // Reupload workflow endpoints

  @Get('reupload-requests')
  listReuploadRequests(@Req() req: any, @Query() filters: any) {
    this.forbidden();
  }

  @Get('docs/:docId/remarks')
  getDocRemarks(@Req() req: any, @Param('docId') docId: string) {
    this.forbidden();
  }

  @Post('reupload-requests/:id/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reuploadFile(
    @Req() req: any,
    @Param('id') requestId: string,
    @UploadedFile() file: any,
  ) {
    this.forbidden();
  }

  @Post('reupload-requests/:id/submit')
  submitReupload(@Req() req: any, @Param('id') requestId: string) {
    this.forbidden();
  }
}
