import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
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
import {
  BranchDocumentsService,
  UploadDocDto,
} from './branch-documents.service';
import { BranchRegistrationsService } from './branch-registrations.service';
import { BranchAccessService } from '../auth/branch-access.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { CreateBranchRegistrationDto } from './dto/create-branch-registration.dto';
import { UpdateBranchRegistrationDto } from './dto/update-branch-registration.dto';
import { UploadBranchDocumentDto } from './dto/upload-branch-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/* ── File upload config ───────────────────── */

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'branch-documents');
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

/* ── Registration upload config ──────────── */

const registrationStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'registrations');
    ensureDir(base);
    cb(null, base);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const registrationUploadOptions = {
  storage: registrationStorage,
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (err: Error | null, accept: boolean) => void) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(
        new BadRequestException('File type not allowed (PDF/PNG/JPEG only)'),
        false,
      );
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_MB * 1024 * 1024 },
};

/* ============================================================
   CLIENT: Branch Document Endpoints
   ============================================================ */

@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientBranchDocumentsController {
  constructor(
    private readonly svc: BranchDocumentsService,
    private readonly regSvc: BranchRegistrationsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** GET /api/client/branches/:id/documents */
  @ApiOperation({ summary: 'List Docs' })
  @Get(':id/documents')
  async listDocs(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    await this.branchAccess.assertBranchAccess(user.userId, id);
    return this.svc.listByBranch(id, user.clientId!, {
      category,
      status,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  /** POST /api/client/branches/:id/documents/upload — branch users only */
  @ApiOperation({ summary: 'Upload Doc' })
  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async uploadDoc(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
    @Body() dto: UploadBranchDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.branchAccess.assertBranchUserOnly(user.userId, id);
    return this.svc.upload(
      id,
      user.clientId!,
      {
        category: dto.category,
        docType: dto.docType,
        periodYear: dto.periodYear ? Number(dto.periodYear) : undefined,
        periodMonth: dto.periodMonth ? Number(dto.periodMonth) : undefined,
      } as UploadDocDto,
      file,
      user.userId,
    );
  }

  /** PUT /api/client/branches/documents/:docId/reupload — branch users only */
  @ApiOperation({ summary: 'Reupload Doc' })
  @Put('documents/:docId/reupload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async reuploadDoc(
    @Param('docId', ParseUUIDPipe) docId: string,
    @CurrentUser() user: ReqUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    // Master users cannot reupload documents
    const isMaster = await this.branchAccess.isMasterUser(user.userId);
    if (isMaster) {
      throw new BadRequestException(
        'Master user cannot perform this action. Only branch users can upload.',
      );
    }
    return this.svc.reupload(docId, user.clientId!, file, user.userId);
  }

  /** GET /api/client/branches/:id/mcd?year=2026&month=1 — single month */
  @ApiOperation({ summary: 'Mcd Schedule' })
  @Get(':id/mcd')
  async mcdSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    await this.branchAccess.assertBranchAccess(user.userId, id);
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    return this.svc.getMcdSchedule(id, user.clientId!, y, m);
  }

  /** GET /api/v1/client/branches/:id/registrations — branch registrations */
  @ApiOperation({ summary: 'List Registrations' })
  @Get(':id/registrations')
  async listRegistrations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.branchAccess.assertBranchAccess(user.userId, id);
    return this.regSvc.listByBranch(id, user.clientId!);
  }

  /** GET /api/v1/client/branches/:id/registration-summary — summary + compliance score */
  @ApiOperation({ summary: 'Registration Summary' })
  @Get(':id/registration-summary')
  async registrationSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.branchAccess.assertBranchAccess(user.userId, id);
    return this.regSvc.getRegistrationSummary(user.clientId!, id);
  }

  /** GET /api/v1/client/branches/registration-summary — client-wide summary */
  @ApiOperation({ summary: 'Client Registration Summary' })
  @Get('registration-summary')
  async clientRegistrationSummary(@CurrentUser() user: ReqUser) {
    return this.regSvc.getRegistrationSummary(user.clientId!);
  }

  /** GET /api/v1/client/branches/registration-alerts — in-app alerts */
  @ApiOperation({ summary: 'Registration Alerts' })
  @Get('registration-alerts')
  async registrationAlerts(
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.regSvc.getAlerts(user.clientId!, branchId);
  }

  /** GET /api/v1/client/branches/:id/audit-observations — observations for branch */
  @ApiOperation({ summary: 'List Audit Observations' })
  @Get(':id/audit-observations')
  async listAuditObservations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.branchAccess.assertBranchAccess(user.userId, id);
    return this.regSvc.listAuditObservations(id, user.clientId!);
  }

  /** GET /api/client/branches/:id/mcd/overview — last 6 months */
  @ApiOperation({ summary: 'Mcd Overview' })
  @Get(':id/mcd/overview')
  async mcdOverview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
    @Query('months') months?: string,
  ) {
    await this.branchAccess.assertBranchAccess(user.userId, id);
    return this.svc.getMcdOverview(
      id,
      user.clientId!,
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
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
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
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
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
  @ApiOperation({ summary: 'Review' })
  @Put(':docId/review')
  async review(
    @Param('docId', ParseUUIDPipe) docId: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; remarks?: string },
  ) {
    if (!['APPROVED', 'REJECTED'].includes(body.status)) {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    return this.svc.review(
      docId,
      body.status,
      body.remarks ?? null,
      user.userId,
      user.roleCode,
    );
  }
}

/* ============================================================
   CRM / ADMIN: Branch Registrations CRUD
   ============================================================ */

@Controller({ path: 'crm/branch-registrations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM', 'ADMIN', 'CCO', 'CEO')
export class CrmBranchRegistrationsController {
  constructor(
    private readonly regSvc: BranchRegistrationsService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  /** GET /api/v1/crm/branch-registrations?branchId=...&clientId=... */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
    @Query('clientId') clientId?: string,
  ) {
    if (!branchId || !clientId) {
      throw new BadRequestException('branchId and clientId are required');
    }
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.regSvc.listByBranch(branchId, clientId);
  }

  /** POST /api/v1/crm/branch-registrations */
  @ApiOperation({ summary: 'Create' })
  @Post()
  async create(
    @Body() dto: CreateBranchRegistrationDto,
    @CurrentUser() user: ReqUser,
  ) {
    // We trust that the service validates branch→client ownership
    void dto;
    void user;
    throw new BadRequestException(
      'Use POST /api/v1/crm/branch-registrations/for-client/:clientId',
    );
  }

  /** POST /api/v1/crm/branch-registrations/for-client/:clientId */
  @ApiOperation({ summary: 'Create For Client' })
  @Post('for-client/:clientId')
  async createForClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateBranchRegistrationDto,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.regSvc.create(dto, clientId, user.userId);
  }

  /** PATCH /api/v1/crm/branch-registrations/:id/for-client/:clientId */
  @ApiOperation({ summary: 'Update' })
  @Patch(':id/for-client/:clientId')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: UpdateBranchRegistrationDto,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.regSvc.update(id, dto, clientId, user.userId);
  }

  /** DELETE /api/v1/crm/branch-registrations/:id/for-client/:clientId */
  @ApiOperation({ summary: 'Remove' })
  @Delete(':id/for-client/:clientId')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.regSvc.remove(id, clientId, user.userId);
  }

  /** POST /api/v1/crm/branch-registrations/:id/for-client/:clientId/upload */
  @ApiOperation({ summary: 'Upload Registration File' })
  @Post(':id/for-client/:clientId/upload')
  @UseInterceptors(FileInterceptor('file', registrationUploadOptions))
  async uploadRegistrationFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: ReqUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('field') field?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    const uploadField = field === 'renewal' ? 'renewal' : 'document';
    return this.regSvc.uploadFile(id, file, clientId, user.userId, uploadField);
  }

  /** GET /api/v1/crm/branch-registrations/summary/:clientId?branchId=... */
  @ApiOperation({ summary: 'Summary' })
  @Get('summary/:clientId')
  async summary(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.regSvc.getRegistrationSummary(clientId, branchId);
  }

  /** GET /api/v1/crm/branch-registrations/alerts/:clientId?branchId=... */
  @ApiOperation({ summary: 'Alerts' })
  @Get('alerts/:clientId')
  async alerts(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    if (user.roleCode === 'CRM') {
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned');
    }
    return this.regSvc.getAlerts(clientId, branchId);
  }
}
