import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'compliance');
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
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (err: Error | null, accept: boolean) => void) => {
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
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.clientListTasks(user, q);
  }

  @ApiOperation({ summary: 'List Items' })
  @Get('tasks/:id/items')
  listItems(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.clientListMcdItems(user, id);
  }

  @ApiOperation({ summary: 'Upload Evidence' })
  @Post('tasks/:id/evidence')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async uploadEvidence(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: { notes?: string; mcdItemId?: string | number },
  ) {
    // Master users cannot upload evidence — only branch users
    const isMaster = await this.branchAccess.isMasterUser(user.userId);
    if (isMaster) {
      throw new BadRequestException(
        'Master user cannot perform this action. Only branch users can upload.',
      );
    }
    return this.svc.clientUploadEvidence(
      user,
      id,
      file,
      dto?.notes,
      dto?.mcdItemId,
    );
  }

  @ApiOperation({ summary: 'Submit Task' })
  @Post('tasks/:id/submit')
  async submitTask(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    // Master users cannot submit tasks — only branch users
    const isMaster = await this.branchAccess.isMasterUser(user.userId);
    if (isMaster) {
      throw new BadRequestException(
        'Master user cannot perform this action. Only branch users can submit.',
      );
    }
    return this.svc.clientSubmitTask(user, id);
  }

  // ── Client Reupload Workflow ──

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.clientListReuploadRequests(user, q);
  }

  @ApiOperation({ summary: 'Reupload File' })
  @Post('reupload-requests/:id/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reuploadFile(
    @CurrentUser() user: ReqUser,
    @Param('id') requestId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.clientReuploadFile(user, requestId, file);
  }

  @ApiOperation({ summary: 'Submit Reupload' })
  @Post('reupload-requests/:id/submit')
  submitReupload(@CurrentUser() user: ReqUser, @Param('id') requestId: string) {
    return this.svc.clientSubmitReupload(user, requestId);
  }
}
