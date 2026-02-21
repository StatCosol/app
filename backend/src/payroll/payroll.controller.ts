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

@Controller({ path: 'payroll', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  // Frontend expects: GET /api/payroll/summary
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @Get('summary')
  getPayrollSummary(@Req() req: any, @Query() q: any) {
    return this.svc.getPayrollSummary(req.user, q);
  }

  // Alias for dashboards: GET /api/payroll/dashboard
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @Get('dashboard')
  getPayrollDashboard(@Req() req: any, @Query() q: any) {
    return this.svc.getPayrollSummary(req.user, q);
  }

  // Frontend expects: GET /api/payroll/clients
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @Get('clients')
  getAssignedClients(@Req() req: any) {
    return this.svc.getAssignedClients(req.user);
  }

  // Simple stub: GET /api/payroll/templates
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @Get('templates')
  listTemplatesStub() {
    return { items: [], total: 0 };
  }

  // Simple stub: GET /api/payroll/payslips
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @Get('payslips')
  listPayslipsStub() {
    return { items: [], total: 0 };
  }

  // Existing endpoint (kept): GET /api/payroll/registers-records
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @Get('registers-records')
  listRegistersRecords(@Req() req: any, @Query() q: any) {
    return this.svc.payrollListRegistersRecords(req.user, q);
  }

  // Frontend expects: GET /api/payroll/registers (alias)
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
  @Get('registers')
  listRegistersAlias(@Req() req: any, @Query() q: any) {
    return this.svc.payrollListRegistersRecords(req.user, q);
  }

  // Frontend expects: GET /api/payroll/registers/:id/download
  @Roles('PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO')
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
  @Patch('registers/:id/approve')
  approveRegister(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveRegister(req.user, id);
  }

  // Reject register: PATCH /api/payroll/registers/:id/reject
  @Roles('PAYROLL', 'ADMIN')
  @Patch('registers/:id/reject')
  rejectRegister(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.rejectRegister(req.user, id, body?.reason);
  }

  // Frontend expects: GET /api/payroll/runs
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  @Get('runs')
  listRuns(@Req() req: any, @Query() q: any) {
    return this.svc.listPayrollRuns(req.user, q);
  }

  // Create payroll run
  @Roles('PAYROLL', 'ADMIN')
  @Post('runs')
  createRun(@Req() req: any, @Body() dto: any) {
    return this.svc.createPayrollRun(req.user, dto);
  }

  // Upload payroll run employees (Excel/CSV)
  @Roles('PAYROLL', 'ADMIN')
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
  @Get('runs/:runId/employees')
  listRunEmployees(@Req() req: any, @Param('runId') runId: string) {
    return this.svc.listPayrollRunEmployees(req.user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees/:employeeId/payslip.pdf
  @Roles('PAYROLL', 'ADMIN', 'CRM')
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
  @Post('runs/:runId/payslips/archive')
  @Roles('PAYROLL', 'ADMIN')
  archiveRunPayslips(@Req() req: any, @Param('runId') runId: string) {
    return this.svc.archiveRunPayslips(req.user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/payslips.zip
  @Roles('PAYROLL', 'ADMIN')
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
  @Get('inputs/:id/files')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  listPayrollInputFilesForPayroll(@Req() req: any, @Param('id') id: string) {
    return this.svc.listPayrollInputFilesForPayroll(req.user, id);
  }

  // Payroll review: update input status (approve / reject / need clarification)
  @Roles('PAYROLL', 'ADMIN')
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

  @Get('clients/:clientId/template')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  getClientTemplateMeta(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.payrollGetClientTemplateMeta(req.user, clientId);
  }

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
}

@Controller({ path: 'client/payroll/inputs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayrollInputsController {
  constructor(private readonly svc: PayrollService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListPayrollInputs(req.user, q);
  }

  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.svc.clientCreatePayrollInput(req.user, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ClientUpdatePayrollInputStatusDto,
  ) {
    return this.svc.clientUpdatePayrollInputStatus(req.user, id, dto);
  }

  @Get(':id/status-history')
  getStatusHistory(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientGetPayrollInputStatusHistory(req.user, id);
  }

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

  @Get(':id/files')
  listFiles(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientListPayrollInputFiles(req.user, id);
  }

  // Client download: GET /api/client/payroll/inputs/files/:id/download
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

@Controller({ path: 'client/payroll/template', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientPayrollTemplateController {
  constructor(private readonly svc: PayrollService) {}

  @Get()
  getTemplateMeta(@Req() req: any) {
    return this.svc.clientGetPayrollTemplateMeta(req.user);
  }

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
@UseGuards(JwtAuthGuard, RolesGuard, ClientMasterGuard)
@Roles('CLIENT')
export class ClientRegistersRecordsController {
  constructor(private readonly svc: PayrollService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListRegistersRecords(req.user, q);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', commonUploadOptions('registers-records')),
  )
  upload(@Req() req: any, @Body() dto: any, @UploadedFile() file: any) {
    return this.svc.clientUploadRegisterRecord(req.user, dto, file);
  }

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

  @Get('clients/:clientId/components-effective')
  getEffectiveComponents(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientEffectiveComponents(req.user, clientId);
  }

  @Post('clients/:clientId/components-effective')
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

  @Get('clients/:clientId/payslip-layout')
  getPayslipLayout(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientPayslipLayout(req.user, clientId);
  }

  @Post('clients/:clientId/payslip-layout')
  savePayslipLayout(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Body() dto: SaveClientPayslipLayoutDto,
  ) {
    return this.svc.saveClientPayslipLayout(req.user, clientId, dto);
  }
}

// ── Auditor Registers ──────────────────────────────────
@Controller({ path: 'auditor/registers', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorRegistersController {
  constructor(private readonly svc: PayrollService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListRegisters(req.user, q);
  }

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
