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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchAccessService } from '../../auth/branch-access.service';
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
@Controller({ path: 'client/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientComplianceController {
  constructor(
    private readonly svc: ComplianceService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListTasks(req.user, q);
  }

  @ApiOperation({ summary: 'List Items' })
  @Get('tasks/:id/items')
  listItems(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientListMcdItems(req.user, id);
  }

  @ApiOperation({ summary: 'Upload Evidence' })
  @Post('tasks/:id/evidence')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async uploadEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: { notes?: string; mcdItemId?: string | number },
  ) {
    // Master users cannot upload evidence — only branch users
    const isMaster = await this.branchAccess.isMasterUser(req.user.userId);
    if (isMaster) {
      throw new BadRequestException(
        'Master user cannot perform this action. Only branch users can upload.',
      );
    }
    return this.svc.clientUploadEvidence(
      req.user,
      id,
      file,
      dto?.notes,
      dto?.mcdItemId,
    );
  }

  @ApiOperation({ summary: 'Submit Task' })
  @Post('tasks/:id/submit')
  async submitTask(@Req() req: any, @Param('id') id: string) {
    // Master users cannot submit tasks — only branch users
    const isMaster = await this.branchAccess.isMasterUser(req.user.userId);
    if (isMaster) {
      throw new BadRequestException(
        'Master user cannot perform this action. Only branch users can submit.',
      );
    }
    return this.svc.clientSubmitTask(req.user, id);
  }

  // ── Client Reupload Workflow ──

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(@Req() req: any, @Query() q: any) {
    return this.svc.clientListReuploadRequests(req.user, q);
  }

  @ApiOperation({ summary: 'Reupload File' })
  @Post('reupload-requests/:id/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reuploadFile(
    @Req() req: any,
    @Param('id') requestId: string,
    @UploadedFile() file: any,
  ) {
    return this.svc.clientReuploadFile(req.user, requestId, file);
  }

  @ApiOperation({ summary: 'Submit Reupload' })
  @Post('reupload-requests/:id/submit')
  submitReupload(@Req() req: any, @Param('id') requestId: string) {
    return this.svc.clientSubmitReupload(req.user, requestId);
  }
}
