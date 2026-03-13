import {
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class BranchReuploadController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(@Req() req: any, @Query() q: any) {
    return this.svc.branchListReuploadRequests(req.user, q);
  }

  @ApiOperation({ summary: 'Reupload File' })
  @Post('reupload-requests/:id/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reuploadFile(
    @Req() req: any,
    @Param('id') requestId: string,
    @UploadedFile() file: any,
  ) {
    return this.svc.branchReuploadFile(req.user, requestId, file);
  }

  @ApiOperation({ summary: 'Submit Reupload' })
  @Post('reupload-requests/:id/submit')
  submitReupload(@Req() req: any, @Param('id') requestId: string) {
    return this.svc.branchSubmitReupload(req.user, requestId);
  }
}
