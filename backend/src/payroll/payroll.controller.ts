import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
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

import { PayrollService } from './payroll.service';
import { SaveClientPayslipLayoutDto } from './dto/save-client-payslip-layout.dto';
import { SaveClientComponentsDto } from './dto/save-client-components.dto';
import { ClientUpdatePayrollInputStatusDto } from './dto/client-update-payroll-input-status.dto';
import { UpdatePayrollInputStatusDto } from './dto/update-payroll-input-status.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_MB = 10;

function makeStorage(folder: string) {
  return diskStorage({
    destination: (req, file, cb) => {
      const base = path.join(process.cwd(), 'uploads', folder);
      ensureDir(base);
      cb(null, base);
    },
    filename: (req, file, cb) => {
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
  fileFilter: (req: any, file: any, cb: any) => {
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

  // Frontend expects: GET /api/payroll/summary
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Summary' })
  @Get('summary')
  getPayrollSummary(@Req() req: any, @Query() q: any) {
    return this.svc.getPayrollSummary(req.user, q);
  }

  // Alias for dashboards: GET /api/payroll/dashboard
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Dashboard' })
  @Get('dashboard')
  getPayrollDashboard(@Req() req: any, @Query() q: any) {
    return this.svc.getPayrollSummary(req.user, q);
  }

  // PF/ESI drill-down: GET /api/payroll/pf-esi-summary
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Pf Esi Summary' })
  @Get('pf-esi-summary')
  getPfEsiSummary(@Req() req: any) {
    return this.svc.getPfEsiSummary(req.user);
  }

  // Employee list for PAYROLL users: GET /api/payroll/employees
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Employees' })
  @Get('employees')
  getPayrollEmployees(@Req() req: any, @Query() q: any) {
    return this.svc.getPayrollEmployees(req.user, q);
  }

  // Employee detail for PAYROLL users: GET /api/payroll/employees/:employeeId
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Payroll Employee Detail' })
  @Get('employees/:employeeId')
  getPayrollEmployeeDetail(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
  ) {
    return this.svc.getPayrollEmployeeDetail(req.user, employeeId);
  }

  // Frontend expects: GET /api/payroll/clients
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Get Assigned Clients' })
  @Get('clients')
  getAssignedClients(@Req() req: any) {
    return this.svc.getAssignedClients(req.user);
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
  async listPayslips(@Req() req: any, @Query() q: any) {
    return this.svc.listPayslips(req.user, q);
  }

  // Existing endpoint (kept): GET /api/payroll/registers-records
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'List Registers Records' })
  @Get('registers-records')
  listRegistersRecords(@Req() req: any, @Query() q: any) {
    return this.svc.payrollListRegistersRecords(req.user, q);
  }

  // Frontend expects: GET /api/payroll/registers (alias)
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'List Registers Alias' })
  @Get('registers')
  listRegistersAlias(@Req() req: any, @Query() q: any) {
    return this.svc.payrollListRegistersRecords(req.user, q);
  }

  // Frontend expects: GET /api/payroll/registers/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Download Register' })
  @Get('registers/:id/download')
  async downloadRegister(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForPayroll(req.user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }

  // Alias: GET /api/payroll/registers-records/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @ApiOperation({ summary: 'Download Register Record' })
  @Get('registers-records/:id/download')
  async downloadRegisterRecord(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForPayroll(req.user, id);
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
  approveRegister(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveRegister(req.user, id);
  }

  // Reject register: PATCH /api/payroll/registers/:id/reject
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Reject Register' })
  @Patch('registers/:id/reject')
  rejectRegister(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.rejectRegister(req.user, id, body?.reason);
  }

  // Frontend expects: GET /api/payroll/runs
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Runs' })
  @Get('runs')
  listRuns(@Req() req: any, @Query() q: any) {
    return this.svc.listPayrollRuns(req.user, q);
  }

  // Create payroll run
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Create Run' })
  @Post('runs')
  createRun(@Req() req: any, @Body() dto: any) {
    return this.svc.createPayrollRun(req.user, dto);
  }

  // Upload payroll run employees (Excel/CSV)
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'File Interceptor' })
  @Post('runs/:runId/employees/upload')
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('payroll-run-employees')),
  )
  uploadRunEmployees(
    @Req() req: any,
    @Param('runId') runId: string,
    @UploadedFile() file: any,
  ) {
    return this.svc.uploadPayrollRunEmployees(req.user, runId, file);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Run Employees' })
  @Get('runs/:runId/employees')
  listRunEmployees(@Req() req: any, @Param('runId') runId: string) {
    return this.svc.listPayrollRunEmployees(req.user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees/:employeeId/payslip.pdf
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Download Generated Payslip' })
  @Get('runs/:runId/employees/:employeeId/payslip.pdf')
  async downloadGeneratedPayslip(
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.generatePayslipPdfForPayroll(
      req.user,
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
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadArchivedPayslipForPayroll(
      req.user,
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
  archiveRunPayslips(@Req() req: any, @Param('runId') runId: string) {
    return this.svc.archiveRunPayslips(req.user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/payslips.zip
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Download Payslips Zip' })
  @Get('runs/:runId/payslips.zip')
  async downloadPayslipsZip(
    @Req() req: any,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    await this.svc.streamPayslipsZip(req.user, runId, res);
  }

  /**
   * Unified Payroll Input Detail endpoint for PAYROLL/Admin
   * Returns summary, files, status history, and notifications in one call
   */
  @ApiOperation({ summary: 'List Payroll Input Files For Payroll' })
  @Get('inputs/:id/files')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  listPayrollInputFilesForPayroll(@Req() req: any, @Param('id') id: string) {
    return this.svc.listPayrollInputFilesForPayroll(req.user, id);
  }

  // Payroll review: update input status (approve / reject / need clarification)
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Update Payroll Input Status' })
  @Patch('inputs/:id/status')
  updatePayrollInputStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollInputStatusDto,
  ) {
    return this.svc.updatePayrollInputStatus(req.user, id, dto);
  }

  // Payroll download: GET /api/payroll/inputs/files/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Download Payroll Input File' })
  @Get('inputs/files/:id/download')
  async downloadPayrollInputFile(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadPayrollInputFileForPayroll(req.user, id);
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
    @Req() req: any,
    @Param('clientId') clientId: string,
    @UploadedFile() file: any,
    @Body() dto: { effectiveFrom?: string; effectiveTo?: string },
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.svc.payrollUploadClientTemplate(req.user, clientId, file, dto);
  }

  @ApiOperation({ summary: 'Get Client Template Meta' })
  @Get('clients/:clientId/template')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  getClientTemplateMeta(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.payrollGetClientTemplateMeta(req.user, clientId);
  }

  @ApiOperation({ summary: 'Download Client Template' })
  @Get('clients/:clientId/template/download')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  async downloadClientTemplate(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.payrollDownloadClientTemplate(
      req.user,
      clientId,
    );
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
  listQueries(@Req() req: any, @Query() q: any) {
    return this.svc.listQueries(req.user, q);
  }

  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Query Detail' })
  @Get('queries/:queryId')
  getQueryDetail(@Req() req: any, @Param('queryId') queryId: string) {
    return this.svc.getQueryDetail(req.user, queryId);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Create Query' })
  @Post('queries')
  createQuery(@Req() req: any, @Body() dto: any) {
    return this.svc.createQuery(req.user, dto);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Add Query Message' })
  @Post('queries/:queryId/messages')
  addQueryMessage(
    @Req() req: any,
    @Param('queryId') queryId: string,
    @Body() dto: any,
  ) {
    return this.svc.addQueryMessage(req.user, queryId, dto.message);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Resolve Query' })
  @Patch('queries/:queryId/resolve')
  resolveQuery(
    @Req() req: any,
    @Param('queryId') queryId: string,
    @Body() dto: any,
  ) {
    return this.svc.resolveQuery(req.user, queryId, dto.resolution);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Update Query Status' })
  @Patch('queries/:queryId/status')
  updateQueryStatus(
    @Req() req: any,
    @Param('queryId') queryId: string,
    @Body() dto: any,
  ) {
    return this.svc.updateQueryStatus(req.user, queryId, dto.status);
  }

  // ── Full & Final ──────────────────────────────────
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'List Fnf' })
  @Get('fnf')
  listFnf(@Req() req: any, @Query() q: any) {
    return this.svc.listFnf(req.user, q);
  }

  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @ApiOperation({ summary: 'Get Fnf Detail' })
  @Get('fnf/:fnfId')
  getFnfDetail(@Req() req: any, @Param('fnfId') fnfId: string) {
    return this.svc.getFnfDetail(req.user, fnfId);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Create Fnf' })
  @Post('fnf')
  createFnf(@Req() req: any, @Body() dto: any) {
    return this.svc.createFnf(req.user, dto);
  }

  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Update Fnf Status' })
  @Patch('fnf/:fnfId/status')
  updateFnfStatus(
    @Req() req: any,
    @Param('fnfId') fnfId: string,
    @Body() dto: any,
  ) {
    return this.svc.updateFnfStatus(req.user, fnfId, dto);
  }
}

@Controller({ path: 'client/payroll/inputs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayrollInputsController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListPayrollInputs(req.user, q);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.svc.clientCreatePayrollInput(req.user, dto);
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ClientUpdatePayrollInputStatusDto,
  ) {
    return this.svc.clientUpdatePayrollInputStatus(req.user, id, dto);
  }

  @ApiOperation({ summary: 'Get Status History' })
  @Get(':id/status-history')
  getStatusHistory(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientGetPayrollInputStatusHistory(req.user, id);
  }

  @ApiOperation({ summary: 'File Interceptor' })
  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('payroll-inputs')),
  )
  uploadFile(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: any,
    @UploadedFile() file: any,
  ) {
    return this.svc.clientUploadPayrollInputFile(req.user, id, dto, file);
  }

  @ApiOperation({ summary: 'List Files' })
  @Get(':id/files')
  listFiles(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientListPayrollInputFiles(req.user, id);
  }

  // Client download: GET /api/client/payroll/inputs/files/:id/download
  @ApiOperation({ summary: 'Download File' })
  @Get('files/:id/download')
  async downloadFile(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadPayrollInputFileForClient(req.user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}

@Controller({ path: 'client/payroll', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayrollMonitoringController {
  constructor(private readonly svc: PayrollService) {}

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  @ApiOperation({ summary: 'List Client Payroll Runs' })
  @Get('runs')
  async runs(@Req() req: any, @Query() q: any) {
    return this.svc.clientListPayrollInputs(req.user, q);
  }

  @ApiOperation({ summary: 'Get Client Payroll Status By Branch' })
  @Get('status-by-branch')
  async statusByBranch(@Req() req: any, @Query() q: any) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(req.user, q));
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
        (!existing.latestCreatedAt || createdAt.localeCompare(existing.latestCreatedAt) > 0)
      ) {
        existing.latestCreatedAt = createdAt;
        existing.latestInputId = String(row?.id || '');
      }
      map.set(branchId, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.pendingInputs !== a.pendingInputs) return b.pendingInputs - a.pendingInputs;
      if (b.approvalQueue !== a.approvalQueue) return b.approvalQueue - a.approvalQueue;
      return String(a.branchId).localeCompare(String(b.branchId));
    });
  }

  @ApiOperation({ summary: 'List Client Payroll Exceptions' })
  @Get('exceptions')
  async exceptions(@Req() req: any, @Query() q: any) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(req.user, q));
    return rows.filter((row) =>
      ['NEEDS_CLARIFICATION', 'REJECTED'].includes(
        String(row?.status || '').toUpperCase(),
      ),
    );
  }

  @ApiOperation({ summary: 'List Client Pending Payroll Inputs' })
  @Get('pending-inputs')
  async pendingInputs(@Req() req: any, @Query() q: any) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(req.user, q));
    return rows.filter((row) =>
      ['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(
        String(row?.status || '').toUpperCase(),
      ),
    );
  }

  @ApiOperation({ summary: 'List Client Payroll Approvals Queue' })
  @Get('approvals')
  async approvals(@Req() req: any, @Query() q: any) {
    const rows = this.toArray(await this.svc.clientListPayrollInputs(req.user, q));
    return rows.filter((row) => String(row?.status || '').toUpperCase() === 'SUBMITTED');
  }
}

@Controller({ path: 'client/payroll/template', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayrollTemplateController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'Get Template Meta' })
  @Get()
  getTemplateMeta(@Req() req: any) {
    return this.svc.clientGetPayrollTemplateMeta(req.user);
  }

  @ApiOperation({ summary: 'Download' })
  @Get('download')
  async download(@Req() req: any, @Res() res: Response) {
    const out = await this.svc.clientDownloadPayrollTemplate(req.user);
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
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListRegistersRecords(req.user, q);
  }

  @ApiOperation({ summary: 'Download Registers Pack' })
  @Get('download-pack')
  async downloadPack(@Req() req: any, @Query() q: any, @Res() res: Response) {
    await this.svc.streamClientRegistersPack(req.user, q, res);
  }

  @ApiOperation({ summary: 'File Interceptor' })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('registers-records')),
  )
  upload(@Req() req: any, @Body() dto: any, @UploadedFile() file: any) {
    return this.svc.clientUploadRegisterRecord(req.user, dto, file);
  }

  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForClient(req.user, id);
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
  getEffectiveComponents(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientEffectiveComponents(req.user, clientId);
  }

  @ApiOperation({ summary: 'Save Effective Components' })
  @Post(':clientId')
  saveEffectiveComponents(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Body() dto: SaveClientComponentsDto,
  ) {
    return this.svc.saveClientComponentOverrides(req.user, clientId, dto);
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
  getPayslipLayout(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientPayslipLayout(req.user, clientId);
  }

  @ApiOperation({ summary: 'Save Payslip Layout' })
  @Post(':clientId')
  savePayslipLayout(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Body() dto: SaveClientPayslipLayoutDto,
  ) {
    return this.svc.saveClientPayslipLayout(req.user, clientId, dto);
  }
}

@Controller({ path: 'client/payroll/settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientPayrollSettingsController {
  constructor(private readonly svc: PayrollService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@Req() req: any) {
    return this.svc.clientGetPayrollSettings(req.user);
  }

  @ApiOperation({ summary: 'Update' })
  @Post()
  update(@Req() req: any, @Body() dto: any) {
    return this.svc.clientUpdatePayrollSettings(req.user, dto);
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
  list(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListRegisters(req.user, q);
  }

  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadRegisterForAuditor(req.user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}
