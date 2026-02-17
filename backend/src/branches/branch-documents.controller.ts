import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchDocumentsService } from './branch-documents.service';
import { BranchAccessService } from '../auth/branch-access.service';
import { AssignmentsService } from '../assignments/assignments.service';

/* ── File upload config ───────────────────── */

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

const storage = diskStorage({
  destination: (req, file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'branch-documents');
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

/* ============================================================
   CLIENT: Branch Document Endpoints
   ============================================================ */

@Controller({ path: 'client/branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientBranchDocumentsController {
  constructor(
    private readonly svc: BranchDocumentsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** GET /api/client/branches/:id/documents */
  @Get(':id/documents')
  async listDocs(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    await this.branchAccess.assertBranchAccess(req.user.userId, id);
    return this.svc.listByBranch(id, req.user.clientId, {
      category,
      status,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  /** POST /api/client/branches/:id/documents/upload — branch users only */
  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async uploadDoc(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() dto: any,
    @UploadedFile() file: any,
  ) {
    await this.branchAccess.assertBranchUserOnly(req.user.userId, id);
    return this.svc.upload(
      id,
      req.user.clientId,
      {
        category: dto.category,
        docType: dto.docType,
        periodYear: dto.periodYear ? Number(dto.periodYear) : undefined,
        periodMonth: dto.periodMonth ? Number(dto.periodMonth) : undefined,
      },
      file,
      req.user.userId,
    );
  }

  /** PUT /api/client/branches/documents/:docId/reupload — branch users only */
  @Put('documents/:docId/reupload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async reuploadDoc(
    @Param('docId', ParseUUIDPipe) docId: string,
    @Req() req: any,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    // Master users cannot reupload documents
    const isMaster = await this.branchAccess.isMasterUser(req.user.userId);
    if (isMaster) {
      throw new BadRequestException(
        'Master user cannot perform this action. Only branch users can upload.',
      );
    }
    return this.svc.reupload(docId, req.user.clientId, file, req.user.userId);
  }

  /** GET /api/client/branches/:id/mcd?year=2026&month=1 — single month */
  @Get(':id/mcd')
  async mcdSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    await this.branchAccess.assertBranchAccess(req.user.userId, id);
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    return this.svc.getMcdSchedule(id, req.user.clientId, y, m);
  }

  /** GET /api/client/branches/:id/mcd/overview — last 6 months */
  @Get(':id/mcd/overview')
  async mcdOverview(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Query('months') months?: string,
  ) {
    await this.branchAccess.assertBranchAccess(req.user.userId, id);
    return this.svc.getMcdOverview(
      id,
      req.user.clientId,
      months ? Number(months) : 6,
    );
  }
}

/* ============================================================
   CRM / AUDITOR: Review Endpoints
   ============================================================ */

@Controller({ path: 'crm/branch-documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM', 'AUDITOR', 'ADMIN', 'CCO', 'CEO')
export class CrmBranchDocumentsController {
  constructor(
    private readonly svc: BranchDocumentsService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  /** GET /api/crm/branch-documents?branchId=...&category=...&status=... */
  @Get()
  async list(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('clientId') clientId?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    if (!branchId || !clientId) {
      throw new BadRequestException('branchId and clientId are required');
    }
    // CRM must be assigned to the client
    if (req.user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        req.user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.svc.listByBranch(branchId, clientId, {
      category,
      status,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  /** PUT /api/crm/branch-documents/:docId/review */
  @Put(':docId/review')
  async review(
    @Param('docId', ParseUUIDPipe) docId: string,
    @Req() req: any,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; remarks?: string },
  ) {
    if (!['APPROVED', 'REJECTED'].includes(body.status)) {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    return this.svc.review(
      docId,
      body.status,
      body.remarks ?? null,
      req.user.userId,
      req.user.roleCode,
    );
  }
}
