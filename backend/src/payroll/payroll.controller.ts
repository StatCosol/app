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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { PayrollService } from './payroll.service';
import { SaveClientPayslipLayoutDto } from './dto/save-client-payslip-layout.dto';
import { SaveClientComponentsDto } from './dto/save-client-components.dto';
import { ClientUpdatePayrollInputStatusDto } from './dto/client-update-payroll-input-status.dto';

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

@Controller('api/payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  // Frontend expects: GET /api/payroll/summary
  @Get('summary')
  getPayrollSummary(@Req() req: any, @Query() q: any) {
    return this.svc.getPayrollSummary(req.user, q);
  }

  // Frontend expects: GET /api/payroll/clients
  @Get('clients')
  getAssignedClients(@Req() req: any) {
    return this.svc.getAssignedClients(req.user);
  }

  // Existing endpoint (kept): GET /api/payroll/registers-records
  @Get('registers-records')
  listRegistersRecords(@Req() req: any, @Query() q: any) {
    return this.svc.payrollListRegistersRecords(req.user, q);
  }

  // Frontend expects: GET /api/payroll/registers (alias)
  @Get('registers')
  listRegistersAlias(@Req() req: any, @Query() q: any) {
    return this.svc.payrollListRegistersRecords(req.user, q);
  }

  // Frontend expects: GET /api/payroll/registers/:id/download
  @Get('registers/:id/download')
  async downloadRegister(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const out = await this.svc.downloadRegisterForPayroll(req.user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.end(out.buffer);
  }

  // Frontend expects: GET /api/payroll/runs
  @Get('runs')
  listRuns(@Req() req: any, @Query() q: any) {
    return this.svc.listPayrollRuns(req.user, q);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees
  @Get('runs/:runId/employees')
  listRunEmployees(@Req() req: any, @Param('runId') runId: string) {
    return this.svc.listPayrollRunEmployees(req.user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/employees/:employeeId/payslip.pdf
  @Get('runs/:runId/employees/:employeeId/payslip.pdf')
  async downloadGeneratedPayslip(
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.generatePayslipPdfForPayroll(req.user, runId, employeeId);
    res.setHeader('Content-Type', out.fileType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.end(out.buffer);
  }

  /**
   * Frontend expects: GET /api/payroll/runs/:runId/employees/:employeeId/payslip.archived.pdf
   * Uses payroll_payslip_archives table.
   */
  @Get('runs/:runId/employees/:employeeId/payslip.archived.pdf')
  async downloadArchivedPayslip(
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const out = await this.svc.downloadArchivedPayslipForPayroll(req.user, runId, employeeId);
    res.setHeader('Content-Type', out.fileType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.end(out.buffer);
  }

  // Frontend expects: POST /api/payroll/runs/:runId/payslips/archive
  @Post('runs/:runId/payslips/archive')
  archiveRunPayslips(@Req() req: any, @Param('runId') runId: string) {
    return this.svc.archiveRunPayslips(req.user, runId);
  }

  // Frontend expects: GET /api/payroll/runs/:runId/payslips.zip
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
  listPayrollInputFilesForPayroll(@Req() req: any, @Param('id') id: string) {
    return this.svc.listPayrollInputFilesForPayroll(req.user, id);
  }
}

@Controller('api/client/payroll/inputs')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() dto: ClientUpdatePayrollInputStatusDto) {
    return this.svc.clientUpdatePayrollInputStatus(req.user, id, dto);
  }

  @Get(':id/status-history')
  getStatusHistory(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientGetPayrollInputStatusHistory(req.user, id);
  }

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file', commonUploadOptions('payroll-inputs')))
  uploadFile(@Req() req: any, @Param('id') id: string, @Body() dto: any, @UploadedFile() file: any) {
    return this.svc.clientUploadPayrollInputFile(req.user, id, dto, file);
  }

  @Get(':id/files')
  listFiles(@Req() req: any, @Param('id') id: string) {
    return this.svc.clientListPayrollInputFiles(req.user, id);
  }
}

@Controller('api/client/payroll/registers-records')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientRegistersRecordsController {
  constructor(private readonly svc: PayrollService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListRegistersRecords(req.user, q);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', commonUploadOptions('registers-records')))
  upload(@Req() req: any, @Body() dto: any, @UploadedFile() file: any) {
    return this.svc.clientUploadRegisterRecord(req.user, dto, file);
  }

  @Get(':id/download')
  async download(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const out = await this.svc.downloadRegisterForClient(req.user, id);
    res.setHeader('Content-Type', out.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.end(out.buffer);
  }
}

// Effective components
@Controller('api/client/payroll/components-effective')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientComponentsEffectiveController {
  constructor(private readonly svc: PayrollService) {}

  @Get('clients/:clientId/components-effective')
  getEffectiveComponents(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientEffectiveComponents(req.user, clientId);
  }

  @Post('clients/:clientId/components-effective')
  saveEffectiveComponents(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: SaveClientComponentsDto) {
    return this.svc.saveClientComponentOverrides(req.user, clientId, dto);
  }
}

// Payslip layout
@Controller('api/client/payroll/payslip-layout')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientPayslipLayoutController {
  constructor(private readonly svc: PayrollService) {}

  @Get('clients/:clientId/payslip-layout')
  getPayslipLayout(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientPayslipLayout(req.user, clientId);
  }

  @Post('clients/:clientId/payslip-layout')
  savePayslipLayout(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: SaveClientPayslipLayoutDto) {
    return this.svc.saveClientPayslipLayout(req.user, clientId, dto);
  }
}
