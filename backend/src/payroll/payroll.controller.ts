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
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientMasterGuard } from '../auth/policies/client-master.guard';
import { ClientPayrollToggleGuard } from '../auth/policies/client-payroll-toggle.guard';

import { PayrollService } from './payroll.service';
import { SaveClientPayslipLayoutDto } from './dto/save-client-payslip-layout.dto';
import { SaveClientComponentsDto } from './dto/save-client-components.dto';
import { ClientUpdatePayrollInputStatusDto } from './dto/client-update-payroll-input-status.dto';
import { UpdatePayrollInputStatusDto } from './dto/update-payroll-input-status.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import {
  CreatePayrollQueryDto,
  AddQueryMessageDto,
  ResolveQueryDto,
  UpdateQueryStatusDto,
} from './dto/payroll-query.dto';
import { CreateFnfDto, UpdateFnfStatusDto } from './dto/payroll-fnf.dto';
import {
  ClientCreatePayrollInputDto,
  ClientUploadPayrollInputFileDto,
  ClientUploadRegisterRecordDto,
  ClientUpdatePayrollSettingsDto,
} from './dto/client-payroll-input.dto';
import { RejectRegisterDto } from './dto/payroll-setup.dto';
import {
  PayrollSummaryQueryDto,
  PayrollEmployeesQueryDto,
  PayslipsQueryDto,
  RegistersQueryDto,
  PayrollRunsQueryDto,
  QueriesListQueryDto,
  FnfListQueryDto,
  ClientPayrollPeriodQueryDto,
  ClientRegistersQueryDto,
  AuditorRegistersQueryDto,
} from './dto/payroll-query-params.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

function makeStorage(folder: string) {
  return diskStorage({
    destination: (_req, _file, cb) => {
      const base = path.join(process.cwd(), 'uploads', folder);
      ensureDir(base);
      cb(null, base);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  });
}

const allowedMimes = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const commonUploadOptions = (folder: string) => ({
  storage: makeStorage(folder),
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new BadRequestException('File type not allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

const templateUploadOptions = commonUploadOptions('payroll-templates');

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  // One-time: Seed March 2026 EL from paysheet data
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Seed March 2026 EL data' })
  @Post('admin/seed-march-el/:runId')
  seedMarchEl(@Param('runId') runId: string) {
    return this.svc.seedMarchEl(runId);
  }

  // One-time: Remove employees not in paysheet from a run
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remove not-in-sheet employees from run' })
  @Post('admin/remove-not-in-sheet/:runId')
  removeNotInSheet(@Param('runId') runId: string) {
    return this.svc.removeNotInSheet(runId);
  }

  // Frontend expects: GET /api/payroll/summary
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Summary' })
  @Get('summary')
  getPayrollSummary(
    @CurrentUser() user: ReqUser,
    @Query() q: PayrollSummaryQueryDto,
  ) {
    return this.svc.getPayrollSummary(user, q);
  }

  // Alias for dashboards: GET /api/payroll/dashboard
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Dashboard' })
  @Get('dashboard')
  getPayrollDashboard(
    @CurrentUser() user: ReqUser,
    @Query() q: PayrollSummaryQueryDto,
  ) {
    return this.svc.getPayrollSummary(user, q);
  }

  // PF/ESI drill-down: GET /api/payroll/pf-esi-summary
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Pf Esi Summary' })
  @Get('pf-esi-summary')
  getPfEsiSummary(@CurrentUser() user: ReqUser) {
    return this.svc.getPfEsiSummary(user);
  }

  // Employee list for PAYROLL users: GET /api/payroll/employees
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Employees' })
  @Get('employees')
  getPayrollEmployees(
    @CurrentUser() user: ReqUser,
    @Query() q: PayrollEmployeesQueryDto,
  ) {
    return this.svc.getPayrollEmployees(user, q);
  }

  // Employee detail for PAYROLL users: GET /api/payroll/employees/:employeeId
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Employee Detail' })
  @Get('employees/:employeeId')
  getPayrollEmployeeDetail(
    @CurrentUser() user: ReqUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.svc.getPayrollEmployeeDetail(user, employeeId);
  }

  // Frontend expects: GET /api/payroll/clients
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Assigned Clients' })
  @Get('clients')
  getAssignedClients(@CurrentUser() user: ReqUser) {
    return this.svc.getAssignedClients(user);
  }

  // GET /api/payroll/templates — real DB query
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Templates' })
  @Get('templates')
  async listTemplates() {
    return this.svc.listTemplates();
  }

  // GET /api/payroll/payslips — real DB query
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Payslips' })
  @Get('payslips')
  async listPayslips(
    @CurrentUser() user: ReqUser,
    @Query() q: PayslipsQueryDto,
  ) {
    return this.svc.listPayslips(user, q);
  }

  // Existing endpoint (kept): GET /api/payroll/registers-records
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'List Registers Records' })
  @Get('registers-records')
  listRegistersRecords(
    @CurrentUser() user: ReqUser,
    @Query() q: RegistersQueryDto,
  ) {
    return this.svc.payrollListRegistersFormatted(user, q);
  }

  // Frontend expects: GET /api/payroll/registers (alias)
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'List Registers Alias' })
  @Get('registers')
  listRegistersAlias(
    @CurrentUser() user: ReqUser,
    @Query() q: RegistersQueryDto,
  ) {
    return this.svc.payrollListRegistersFormatted(user, q);
  }

  // Frontend expects: GET /api/payroll/registers/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Download Register' })
  @Get('registers/:id/download')
  async downloadRegister(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForPayroll(user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  // GET /api/payroll/registers/download-pack  — bulk ZIP download
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Download Registers Pack (ZIP)' })
  @Get('registers/download-pack')
  async downloadRegistersPack(
    @CurrentUser() user: ReqUser,
    @Query() q: RegistersQueryDto,
    @Res() res: Response,
  ) {
    await this.svc.streamPayrollRegistersPack(user, q, res);
  }

  // Alias: GET /api/payroll/registers-records/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Download Register Record' })
  @Get('registers-records/:id/download')
  async downloadRegisterRecord(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForPayroll(user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  // Approve register: PATCH /api/payroll/registers/:id/approve
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Approve Register' })
  @Patch('registers/:id/approve')
  approveRegister(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.approveRegister(user, id);
  }

  // Reject register: PATCH /api/payroll/registers/:id/reject
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Reject Register' })
  @Patch('registers/:id/reject')
  rejectRegister(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: RejectRegisterDto,
  ) {
    return this.svc.rejectRegister(user, id, body?.reason);
  }

  // Frontend expects: GET /api/payroll/runs
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Runs' })
  @Get('runs')
  listRuns(@CurrentUser() user: ReqUser, @Query() q: PayrollRunsQueryDto) {
    return this.svc.listPayrollRuns(user, q);
  }

  // Create payroll run
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Create Run' })
  @Post('runs')
  createRun(@CurrentUser() user: ReqUser, @Body() dto: CreatePayrollRunDto) {
    return this.svc.createPayrollRun(user, dto);
  }

  // Delete draft payroll run
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Delete Draft Run' })
  @Delete('runs/:runId')
  deleteRun(
    @CurrentUser() user: ReqUser,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.svc.deleteDraftPayrollRun(user, runId);
  }

  // Upload payroll run employees (Excel/CSV)
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'File Interceptor' })
  @Post('runs/:runId/employees/upload')
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('payroll-run-employees')),
  )
  uploadRunEmployees(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadPayrollRunEmployees(user, runId, file);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Run Employees' })
  @Get('runs/:runId/employees')
  listRunEmployees(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
  ) {
    return this.svc.listPayrollRunEmployees(user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees/:employeeId/payslip.pdf
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Download Generated Payslip' })
  @Get('runs/:runId/employees/:employeeId/payslip.pdf')
  async downloadGeneratedPayslip(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.generatePayslipPdfForPayroll(
      user,
      runId,
      employeeId,
    );
    res.setHeader('Content-Type', out.fileType || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  /**
   * Frontend expects: GET /api/payroll/runs/:runId/employees/:employeeId/payslip.archived.pdf
   * Uses payroll_payslip_archives table.
   */
  @ApiOperation({ summary: 'Download Archived Payslip' })
  @Get('runs/:runId/employees/:employeeId/payslip.archived.pdf')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  async downloadArchivedPayslip(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadArchivedPayslipForPayroll(
      user,
      runId,
      employeeId,
    );
    res.setHeader('Content-Type', out.fileType || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  // Frontend expects: POST /api/payroll/runs/:runId/payslips/archive
  @ApiOperation({ summary: 'Archive Run Payslips' })
  @Post('runs/:runId/payslips/archive')
  @Roles('PAYROLL', 'ADMIN')
  archiveRunPayslips(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
  ) {
    return this.svc.archiveRunPayslips(user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/payslips.zip
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Download Payslips Zip' })
  @Get('runs/:runId/payslips.zip')
  async downloadPayslipsZip(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    await this.svc.streamPayslipsZip(user, runId, res);
  }

  /**
   * Unified Payroll Input Detail endpoint for PAYROLL/Admin
   * Returns summary, files, status history, and notifications in one call
   */
  @ApiOperation({ summary: 'List Payroll Input Files For Payroll' })
  @Get('inputs/:id/files')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  listPayrollInputFilesForPayroll(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
  ) {
    return this.svc.listPayrollInputFilesForPayroll(user, id);
  }

  // Payroll review: update input status (approve / reject / need clarification)
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Update Payroll Input Status' })
  @Patch('inputs/:id/status')
  updatePayrollInputStatus(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollInputStatusDto,
  ) {
    return this.svc.updatePayrollInputStatus(user, id, dto);
  }

  // Payroll download: GET /api/payroll/inputs/files/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Download Payroll Input File' })
  @Get('inputs/files/:id/download')
  async downloadPayrollInputFile(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadPayrollInputFileForPayroll(user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  // Payroll uploads per-client template
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Upload Client Template' })
  @Post('clients/:clientId/template')
  @UseInterceptors(FileInterceptor('file', templateUploadOptions))
  uploadClientTemplate(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: { effectiveFrom?: string; effectiveTo?: string },
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.svc.payrollUploadClientTemplate(user, clientId, file, dto);
  }

  @ApiOperation({ summary: 'Get Client Template Meta' })
  @Get('clients/:clientId/template')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  getClientTemplateMeta(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
  ) {
    return this.svc.payrollGetClientTemplateMeta(user, clientId);
  }

  @ApiOperation({ summary: 'Download Client Template' })
  @Get('clients/:clientId/template/download')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  async downloadClientTemplate(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.payrollDownloadClientTemplate(user, clientId);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  // ── Payroll Queries ──────────────────────────────────
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Queries' })
  @Get('queries')
  listQueries(@CurrentUser() user: ReqUser, @Query() q: QueriesListQueryDto) {
    return this.svc.listQueries(user, q);
  }

  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Query Detail' })
  @Get('queries/:queryId')
  getQueryDetail(
    @CurrentUser() user: ReqUser,
    @Param('queryId') queryId: string,
  ) {
    return this.svc.getQueryDetail(user, queryId);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Create Query' })
  @Post('queries')
  createQuery(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreatePayrollQueryDto,
  ) {
    return this.svc.createQuery(user, dto);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Add Query Message' })
  @Post('queries/:queryId/messages')
  addQueryMessage(
    @CurrentUser() user: ReqUser,
    @Param('queryId') queryId: string,
    @Body() dto: AddQueryMessageDto,
  ) {
    return this.svc.addQueryMessage(user, queryId, dto.message);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Resolve Query' })
  @Patch('queries/:queryId/resolve')
  resolveQuery(
    @CurrentUser() user: ReqUser,
    @Param('queryId') queryId: string,
    @Body() dto: ResolveQueryDto,
  ) {
    return this.svc.resolveQuery(user, queryId, dto.resolution);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Update Query Status' })
  @Patch('queries/:queryId/status')
  updateQueryStatus(
    @CurrentUser() user: ReqUser,
    @Param('queryId') queryId: string,
    @Body() dto: UpdateQueryStatusDto,
  ) {
    return this.svc.updateQueryStatus(user, queryId, dto.status);
  }

  // ── Full & Final ──────────────────────────────────
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Fnf' })
  @Get('fnf')
  listFnf(@CurrentUser() user: ReqUser, @Query() q: FnfListQueryDto) {
    return this.svc.listFnf(user, q);
  }

  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Fnf Detail' })
  @Get('fnf/:fnfId')
  getFnfDetail(@CurrentUser() user: ReqUser, @Param('fnfId') fnfId: string) {
    return this.svc.getFnfDetail(user, fnfId);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Create Fnf' })
  @Post('fnf')
  createFnf(@CurrentUser() user: ReqUser, @Body() dto: CreateFnfDto) {
    return this.svc.createFnf(user, dto);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Update Fnf Status' })
  @Patch('fnf/:fnfId/status')
  updateFnfStatus(
    @CurrentUser() user: ReqUser,
    @Param('fnfId') fnfId: string,
    @Body() dto: UpdateFnfStatusDto,
  ) {
    return this.svc.updateFnfStatus(user, fnfId, dto);
  }

  // ── F&F Settlement Documents ──────────────────────
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Upload FnF settlement document' })
  @Post('fnf/:fnfId/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'fnf-documents');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
          );
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadFnfDocument(
    @CurrentUser() user: ReqUser,
    @Param('fnfId', ParseUUIDPipe) fnfId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
    @Body('docName') docName: string,
    @Body('remarks') remarks?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!docType) throw new BadRequestException('docType is required');
    return this.svc.uploadFnfDocument(
      user,
      fnfId,
      {
        fileName: file.filename,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      docType,
      docName || file.originalname,
      remarks,
    );
  }

  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List FnF documents' })
  @Get('fnf/:fnfId/documents')
  listFnfDocuments(
    @CurrentUser() user: ReqUser,
    @Param('fnfId', ParseUUIDPipe) fnfId: string,
  ) {
    return this.svc.listFnfDocuments(user, fnfId);
  }

  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Download FnF document' })
  @Get('fnf/documents/:docId/download')
  async downloadFnfDocument(
    @CurrentUser() user: ReqUser,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Res() res: Response,
  ) {
    const doc = await this.svc.getFnfDocument(user, docId);
    if (!fs.existsSync(doc.filePath)) {
      throw new BadRequestException('File not found on server');
    }
    res.download(doc.filePath, doc.docName || doc.fileName);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Delete FnF document' })
  @Delete('fnf/documents/:docId')
  deleteFnfDocument(
    @CurrentUser() user: ReqUser,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.svc.deleteFnfDocument(user, docId);
  }
}

@Controller({ path: 'client/payroll/inputs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientPayrollToggleGuard)
@Roles('CLIENT')
export class ClientPayrollInputsController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: ClientPayrollPeriodQueryDto) {
    return this.svc.clientListPayrollInputs(user, q);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(
    @CurrentUser() user: ReqUser,
    @Body() dto: ClientCreatePayrollInputDto,
  ) {
    return this.svc.clientCreatePayrollInput(user, dto);
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: ClientUpdatePayrollInputStatusDto,
  ) {
    return this.svc.clientUpdatePayrollInputStatus(user, id, dto);
  }

  @ApiOperation({ summary: 'Get Status History' })
  @Get(':id/status-history')
  getStatusHistory(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.clientGetPayrollInputStatusHistory(user, id);
  }

  @ApiOperation({ summary: 'File Interceptor' })
  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('payroll-inputs')),
  )
  uploadFile(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: ClientUploadPayrollInputFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.clientUploadPayrollInputFile(user, id, dto, file);
  }

  @ApiOperation({ summary: 'List Files' })
  @Get(':id/files')
  listFiles(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.clientListPayrollInputFiles(user, id);
  }

  // Client download: GET /api/client/payroll/inputs/files/:id/download
  @ApiOperation({ summary: 'Download File' })
  @Get('files/:id/download')
  async downloadFile(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadPayrollInputFileForClient(user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}

@Controller({ path: 'client/payroll', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientPayrollToggleGuard)
@Roles('CLIENT')
export class ClientPayrollMonitoringController {
  constructor(private readonly svc: PayrollService) {}

  private toArray(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) return payload as Record<string, unknown>[];
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray(obj.items))
        return obj.items as Record<string, unknown>[];
      if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
    }
    return [];
  }

  @ApiOperation({ summary: 'List Client Payroll Runs' })
  @Get('runs')
  async runs(
    @CurrentUser() user: ReqUser,
    @Query() q: ClientPayrollPeriodQueryDto,
  ) {
    return this.svc.clientListPayrollRuns(user, q);
  }

  @ApiOperation({ summary: 'Get Client Payroll Status By Branch' })
  @Get('status-by-branch')
  async statusByBranch(
    @CurrentUser() user: ReqUser,
    @Query() q: ClientPayrollPeriodQueryDto,
  ) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(user, q));
    const map = new Map<
      string,
      {
        branchId: string;
        totalInputs: number;
        pendingInputs: number;
        approvalQueue: number;
        exceptions: number;
        completed: number;
        latestInputId: string | null;
        latestCreatedAt: string | null;
      }
    >();

    for (const row of rows) {
      const branchId = String(row?.branchId || 'UNMAPPED');
      const status = String(row?.status || '').toUpperCase();
      const createdAt = row?.createdAt ? String(row.createdAt) : null;
      const existing = map.get(branchId) || {
        branchId,
        totalInputs: 0,
        pendingInputs: 0,
        approvalQueue: 0,
        exceptions: 0,
        completed: 0,
        latestInputId: null,
        latestCreatedAt: null,
      };
      existing.totalInputs += 1;
      if (['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(status))
        existing.pendingInputs += 1;
      if (status === 'SUBMITTED') existing.approvalQueue += 1;
      if (['NEEDS_CLARIFICATION', 'REJECTED'].includes(status))
        existing.exceptions += 1;
      if (status === 'COMPLETED') existing.completed += 1;

      if (
        createdAt &&
        (!existing.latestCreatedAt ||
          createdAt.localeCompare(existing.latestCreatedAt) > 0)
      ) {
        existing.latestCreatedAt = createdAt;
        existing.latestInputId = String(row?.id || '');
      }
      map.set(branchId, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.pendingInputs !== a.pendingInputs)
        return b.pendingInputs - a.pendingInputs;
      if (b.approvalQueue !== a.approvalQueue)
        return b.approvalQueue - a.approvalQueue;
      return String(a.branchId).localeCompare(String(b.branchId));
    });
  }

  @ApiOperation({ summary: 'List Client Payroll Exceptions' })
  @Get('exceptions')
  async exceptions(
    @CurrentUser() user: ReqUser,
    @Query() q: ClientPayrollPeriodQueryDto,
  ) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(user, q));
    return rows.filter((row) =>
      ['NEEDS_CLARIFICATION', 'REJECTED'].includes(
        String(row?.status || '').toUpperCase(),
      ),
    );
  }

  @ApiOperation({ summary: 'List Client Pending Payroll Inputs' })
  @Get('pending-inputs')
  async pendingInputs(
    @CurrentUser() user: ReqUser,
    @Query() q: ClientPayrollPeriodQueryDto,
  ) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(user, q));
    return rows.filter((row) =>
      ['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(
        String(row?.status || '').toUpperCase(),
      ),
    );
  }

  @ApiOperation({ summary: 'List Client Payroll Approvals Queue' })
  @Get('approvals')
  async approvals(
    @CurrentUser() user: ReqUser,
    @Query() q: ClientPayrollPeriodQueryDto,
  ) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(user, q));
    return rows.filter(
      (row) => String(row?.status || '').toUpperCase() === 'SUBMITTED',
    );
  }
}

@Controller({ path: 'client/payroll/template', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayrollTemplateController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'Get Template Meta' })
  @Get()
  getTemplateMeta(@CurrentUser() user: ReqUser) {
    return this.svc.clientGetPayrollTemplateMeta(user);
  }

  @ApiOperation({ summary: 'Download' })
  @Get('download')
  async download(@CurrentUser() user: ReqUser, @Res() res: Response) {
    const out = await this.svc.clientDownloadPayrollTemplate(user);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}

@Controller({ path: 'client/payroll/registers-records', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientRegistersRecordsController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: ClientRegistersQueryDto) {
    return this.svc.clientListRegistersRecords(user, q);
  }

  @ApiOperation({ summary: 'Download Registers Pack' })
  @Get('download-pack')
  async downloadPack(
    @CurrentUser() user: ReqUser,
    @Query() q: ClientRegistersQueryDto,
    @Res() res: Response,
  ) {
    await this.svc.streamClientRegistersPack(user, q, res);
  }

  @ApiOperation({ summary: 'File Interceptor' })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('registers-records')),
  )
  upload(
    @CurrentUser() user: ReqUser,
    @Body() dto: ClientUploadRegisterRecordDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.clientUploadRegisterRecord(user, dto, file);
  }

  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForClient(user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}

// Effective components
@Controller({ path: 'client/payroll/components-effective', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientComponentsEffectiveController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'Get Effective Components' })
  @Get(':clientId')
  getEffectiveComponents(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
  ) {
    return this.svc.getClientEffectiveComponents(user, clientId);
  }

  @ApiOperation({ summary: 'Save Effective Components' })
  @Post(':clientId')
  saveEffectiveComponents(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Body() dto: SaveClientComponentsDto,
  ) {
    return this.svc.saveClientComponentOverrides(user, clientId, dto);
  }
}

// Payslip layout
@Controller({ path: 'client/payroll/payslip-layout', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayslipLayoutController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'Get Payslip Layout' })
  @Get(':clientId')
  getPayslipLayout(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
  ) {
    return this.svc.getClientPayslipLayout(user, clientId);
  }

  @ApiOperation({ summary: 'Save Payslip Layout' })
  @Post(':clientId')
  savePayslipLayout(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Body() dto: SaveClientPayslipLayoutDto,
  ) {
    return this.svc.saveClientPayslipLayout(user, clientId, dto);
  }
}

@Controller({ path: 'client/payroll/settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientPayrollSettingsController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@CurrentUser() user: ReqUser) {
    return this.svc.clientGetPayrollSettings(user);
  }

  @ApiOperation({ summary: 'Update' })
  @Post()
  update(
    @CurrentUser() user: ReqUser,
    @Body() dto: ClientUpdatePayrollSettingsDto,
  ) {
    return this.svc.clientUpdatePayrollSettings(user, dto);
  }
}

// ── Auditor Registers ──────────────────────────────────
@Controller({ path: 'auditor/registers', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorRegistersController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: AuditorRegistersQueryDto) {
    return this.svc.auditorListRegisters(user, q);
  }

  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForAuditor(user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}
