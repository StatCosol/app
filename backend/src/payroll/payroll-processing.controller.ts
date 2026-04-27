import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollProcessingService } from './payroll-processing.service';
import { PayrollEngineService } from './engine/payroll-engine.service';
import { PfEcrGenerator } from './generators/pf-ecr.generator';
import { EsiGenerator } from './generators/esi.generator';
import { RegisterGenerator } from './generators/register.generator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { DataSource } from 'typeorm';

import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const breakupUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const base = path.join(process.cwd(), 'uploads', 'payroll-breakups');
      ensureDir(base);
      cb(null, base);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new BadRequestException('Only Excel/CSV files allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/runs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollProcessingController {
  constructor(
    private readonly processingSvc: PayrollProcessingService,
    private readonly engineSvc: PayrollEngineService,
    private readonly pfEcr: PfEcrGenerator,
    private readonly esi: EsiGenerator,
    private readonly register: RegisterGenerator,
    private readonly ds: DataSource,
  ) {}

  // Upload breakup Excel
  @ApiOperation({ summary: 'Upload Breakup' })
  @Post(':runId/upload-breakup')
  @UseInterceptors(FileInterceptor('file', breakupUploadOptions))
  uploadBreakup(
    @Param('runId') runId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.processingSvc.uploadBreakup(runId, file);
  }

  // Upload attendance Excel (Employee Code, Name, Working Days, OT Hours)
  @ApiOperation({ summary: 'Upload Attendance' })
  @Post(':runId/upload-attendance')
  @UseInterceptors(FileInterceptor('file', breakupUploadOptions))
  uploadAttendance(
    @Param('runId') runId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.processingSvc.uploadAttendance(runId, file);
  }

  // Process payroll run (compute statutory deductions)
  @ApiOperation({ summary: 'Process Run' })
  @Post(':runId/process')
  processRun(@Param('runId') runId: string) {
    return this.engineSvc.processWithEngine(runId);
  }

  // Reprocess specific employees (e.g. after attendance correction)
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Reprocess specific employees in a run' })
  @Post(':runId/reprocess-employees')
  async reprocessEmployees(
    @Param('runId') runId: string,
    @Body() body: { employeeCodes: string[] },
  ) {
    const codes = body?.employeeCodes;
    if (!Array.isArray(codes) || !codes.length) {
      throw new BadRequestException('employeeCodes array is required');
    }
    const result = await this.engineSvc.processSpecificEmployees(runId, codes);
    return { runId, ...result };
  }

  // Add employees to an existing run by employee codes + compute their payroll
  @Roles('PAYROLL', 'ADMIN')
  @ApiOperation({ summary: 'Add employees to run and process' })
  @Post(':runId/add-employees')
  async addEmployeesToRun(
    @Param('runId') runId: string,
    @Body() body: { employeeCodes: string[] },
  ) {
    const codes = body?.employeeCodes;
    if (!Array.isArray(codes) || !codes.length) {
      throw new BadRequestException('employeeCodes array is required');
    }

    const runRepo = this.ds.getRepository(PayrollRunEntity);
    const runEmpRepo = this.ds.getRepository(PayrollRunEmployeeEntity);
    const empRepo = this.ds.getRepository(EmployeeEntity);

    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    const added: string[] = [];
    const skipped: string[] = [];

    for (const code of codes) {
      const existing = await runEmpRepo.findOne({
        where: { runId, employeeCode: code },
      });
      if (existing) {
        skipped.push(code);
        continue;
      }

      const master = await empRepo.findOne({
        where: { employeeCode: code, clientId: run.clientId },
      });
      if (!master) {
        skipped.push(code);
        continue;
      }

      const newEmp = runEmpRepo.create({
        runId: run.id,
        clientId: run.clientId,
        branchId: master.branchId ?? run.branchId ?? null,
        employeeId: master.id,
        employeeCode: master.employeeCode,
        employeeName: master.name,
        designation: master.designation ?? null,
        uan: master.uan ?? null,
        esic: master.esic ?? null,
        stateCode: master.stateCode ?? null,
      });
      await runEmpRepo.save(newEmp);
      added.push(code);
    }

    // Process the newly added employees through the payroll engine
    let engineResult: any = null;
    if (added.length) {
      engineResult = await this.engineSvc.processSpecificEmployees(
        runId,
        added,
      );
    }

    return { runId, added, skipped, engineResult };
  }

  // Generate PF ECR text file
  @ApiOperation({ summary: 'Generate Pf Ecr' })
  @Post(':runId/generate/pf-ecr')
  async generatePfEcr(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const result = await this.pfEcr.generate(runId, user.userId);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.content);
  }

  // Generate ESI contribution file
  @ApiOperation({ summary: 'Generate Esi' })
  @Post(':runId/generate/esi')
  async generateEsi(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const result = await this.esi.generate(runId, user.userId);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.content);
  }

  // Generate state-wise register
  @ApiOperation({ summary: 'Generate Register' })
  @Post(':runId/generate/registers')
  generateRegister(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Query('stateCode') stateCode: string,
    @Query('registerType') registerType: string,
  ) {
    if (!stateCode || !registerType) {
      throw new BadRequestException('stateCode and registerType are required');
    }
    return this.register.generate(runId, stateCode, registerType, user.userId);
  }

  // Generate ALL applicable registers for a branch (branch-type-aware)
  @ApiOperation({ summary: 'Generate all applicable registers for a branch' })
  @Post(':runId/generate/all-registers')
  generateAllRegisters(
    @CurrentUser() user: ReqUser,
    @Param('runId') runId: string,
    @Query('branchId') branchId: string,
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId query param is required');
    }
    return this.register.generateAllForBranch(runId, branchId, user.userId);
  }

  // List applicable register templates for a specific branch
  @ApiOperation({ summary: 'List applicable templates for a branch' })
  @Get('register-templates/branch/:branchId')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  listBranchTemplates(@Param('branchId') branchId: string) {
    return this.register.listTemplatesForBranch(branchId);
  }

  // List available register templates
  @ApiOperation({ summary: 'List Templates' })
  @Get('register-templates')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  listTemplates(@Query('stateCode') stateCode?: string) {
    return this.register.listTemplates(stateCode);
  }

  // Temporary: seed payroll config for a specific client
  @Post('seed-config')
  @Roles('ADMIN')
  async seedConfig(@Query('clientId') clientId: string) {
    if (!clientId)
      throw new BadRequestException('clientId query param required');
    const sql = `
DO $$
DECLARE
  v_cid  uuid := '${clientId.replace(/[^a-f0-9\-]/gi, '')}';
  v_rs_id   uuid;
  v_st_id   uuid;
  v_comp_ag uuid;
  v_comp_bas uuid;
  v_comp_hra uuid;
  v_comp_oth uuid;
  v_comp_att uuid;
BEGIN
  -- Client setup (upsert)
  INSERT INTO payroll_client_setup (id, client_id, pf_enabled, esi_enabled, pt_enabled, lwf_enabled, pf_employer_rate, pf_employee_rate, esi_employer_rate, esi_employee_rate, pf_wage_ceiling, esi_wage_ceiling, pf_gross_threshold)
  VALUES (gen_random_uuid(), v_cid, true, true, true, false, 13.00, 12.00, 3.25, 0.75, 15000, 21000, 0)
  ON CONFLICT (client_id) DO UPDATE SET
    pf_enabled = EXCLUDED.pf_enabled,
    esi_enabled = EXCLUDED.esi_enabled,
    pt_enabled = EXCLUDED.pt_enabled,
    pf_employer_rate = EXCLUDED.pf_employer_rate,
    pf_employee_rate = EXCLUDED.pf_employee_rate,
    esi_employer_rate = EXCLUDED.esi_employer_rate,
    esi_employee_rate = EXCLUDED.esi_employee_rate,
    pf_wage_ceiling = EXCLUDED.pf_wage_ceiling,
    esi_wage_ceiling = EXCLUDED.esi_wage_ceiling,
    pf_gross_threshold = EXCLUDED.pf_gross_threshold;

  -- Components
  DELETE FROM payroll_component_rules WHERE component_id IN (SELECT id FROM payroll_components WHERE client_id = v_cid);
  DELETE FROM payroll_components WHERE client_id = v_cid;

  INSERT INTO payroll_components (id, client_id, code, name, component_type, is_taxable, affects_pf_wage, affects_esi_wage, is_required, display_order, is_active) VALUES
    (gen_random_uuid(), v_cid, 'ACTUAL_GROSS', 'Actual Gross',         'INFO',    false, false, false, true,  1, true),
    (gen_random_uuid(), v_cid, 'BASIC',        'Basic Salary',         'EARNING', true,  true,  true,  true,  2, true),
    (gen_random_uuid(), v_cid, 'HRA',          'House Rent Allowance', 'EARNING', false, false, true,  false, 3, true),
    (gen_random_uuid(), v_cid, 'OTHERS',       'Other Allowances',     'EARNING', true,  false, true,  false, 4, true),
    (gen_random_uuid(), v_cid, 'ATT_BONUS',    'Attendance Bonus',     'EARNING', true,  false, false, false, 5, true),
    (gen_random_uuid(), v_cid, 'OTHER_EARNINGS','Other Earnings',       'EARNING', true,  false, true,  false, 6, true),
    (gen_random_uuid(), v_cid, 'ARREAR_ATT_BONUS', 'Arrear Attendance Bonus', 'EARNING', true,  false, false, false, 7, true),
    (gen_random_uuid(), v_cid, 'PF_EMP',       'PF (Employee)',        'DEDUCTION', false, false, false, false, 10, true),
    (gen_random_uuid(), v_cid, 'PF_ER',        'PF (Employer)',        'EMPLOYER',  false, false, false, false, 11, true),
    (gen_random_uuid(), v_cid, 'ESI_EMP',      'ESI (Employee)',       'DEDUCTION', false, false, false, false, 12, true),
    (gen_random_uuid(), v_cid, 'ESI_ER',       'ESI (Employer)',       'EMPLOYER',  false, false, false, false, 13, true),
    (gen_random_uuid(), v_cid, 'PT',           'Professional Tax',     'DEDUCTION', false, false, false, false, 14, true),
    (gen_random_uuid(), v_cid, 'NET_PAY',      'Net Pay',             'INFO',      false, false, false, false, 99, true);

  SELECT id INTO v_comp_ag  FROM payroll_components WHERE client_id = v_cid AND code = 'ACTUAL_GROSS';
  SELECT id INTO v_comp_bas FROM payroll_components WHERE client_id = v_cid AND code = 'BASIC';
  SELECT id INTO v_comp_hra FROM payroll_components WHERE client_id = v_cid AND code = 'HRA';
  SELECT id INTO v_comp_oth FROM payroll_components WHERE client_id = v_cid AND code = 'OTHERS';
  SELECT id INTO v_comp_att FROM payroll_components WHERE client_id = v_cid AND code = 'ATT_BONUS';

  -- Rule Set
  UPDATE pay_rule_sets SET is_active = false WHERE client_id = v_cid;
  v_rs_id := gen_random_uuid();
  INSERT INTO pay_rule_sets (id, client_id, branch_id, name, effective_from, effective_to, is_active)
  VALUES (v_rs_id, v_cid, NULL, 'Standard Rules', '2026-01-01', NULL, true);

  INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
  VALUES (gen_random_uuid(), v_rs_id, 'MIN_WAGES', 15000, 'INR', 'Minimum wages');

  -- Salary Structure
  UPDATE pay_salary_structures SET is_active = false WHERE client_id = v_cid;
  v_st_id := gen_random_uuid();
  INSERT INTO pay_salary_structures (id, client_id, name, scope_type, branch_id, department_id, grade_id, employee_id, rule_set_id, effective_from, effective_to, is_active)
  VALUES (v_st_id, v_cid, 'Standard Structure', 'TENANT', NULL, NULL, NULL, NULL, v_rs_id, '2026-01-01', NULL, true);

  INSERT INTO pay_salary_structure_items (id, structure_id, component_id, calc_method, fixed_amount, percentage, percentage_base, formula, slab_ref, balancing_config, min_amount, max_amount, rounding_mode, priority, enabled) VALUES
    (gen_random_uuid(), v_st_id, v_comp_ag,  'FIXED', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NO_ROUNDING', 1, true),
    (gen_random_uuid(), v_st_id, v_comp_bas, 'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS <= 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000))',
     NULL, NULL, NULL, NULL, 'NEAREST_RUPEE', 2, true),
    (gen_random_uuid(), v_st_id, v_comp_hra, 'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS > 30000, BASIC * 0.40, 0)',
     NULL, NULL, NULL, NULL, 'NEAREST_RUPEE', 3, true),
    (gen_random_uuid(), v_st_id, v_comp_oth, 'FORMULA', NULL, NULL, NULL,
     'MAX(ACTUAL_GROSS - BASIC - HRA, 0)',
     NULL, NULL, NULL, NULL, 'NEAREST_RUPEE', 4, true),
    (gen_random_uuid(), v_st_id, v_comp_att, 'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS <= 25000, IF(WORKED_DAYS >= 24.5, 2000, 0), 0)',
     NULL, NULL, NULL, NULL, 'NO_ROUNDING', 5, true);

  -- PT Slabs (Telangana)
  DELETE FROM payroll_statutory_slabs WHERE client_id = v_cid AND state_code = 'TS' AND component_code = 'PT';
  INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at) VALUES
    (gen_random_uuid(), v_cid, 'TS', 'PT', 0,     15000, 0,   NOW()),
    (gen_random_uuid(), v_cid, 'TS', 'PT', 15001, 20000, 150, NOW()),
    (gen_random_uuid(), v_cid, 'TS', 'PT', 20001, NULL,  200, NOW());

  RAISE NOTICE 'Config seeded for client %', v_cid;
END $$;
`;
    await this.ds.query(sql);
    return { ok: true, message: 'Payroll config seeded for ' + clientId };
  }

  // Temporary admin: fix employee monthly_gross
  @Post('fix-employee-gross')
  @Roles('ADMIN')
  async fixEmployeeGross(
    @Body()
    body: {
      clientId: string;
      fixes: Array<{ empCode: string; monthlyGross: number }>;
    },
  ) {
    let updated = 0;
    const notFound: string[] = [];
    for (const f of body.fixes) {
      const result = await this.ds.query(
        `UPDATE employees SET monthly_gross = $1 WHERE client_id = $2 AND employee_code = $3 AND is_active = TRUE`,
        [f.monthlyGross, body.clientId, f.empCode],
      );
      if (result[1] > 0) updated++;
      else notFound.push(f.empCode);
    }
    return { ok: true, updated, notFound };
  }

  // Temporary debug: inspect calc data for a run employee
  @Get('debug/:runId/:empCode')
  @Roles('ADMIN')
  async debugCalc(
    @Param('runId') runId: string,
    @Param('empCode') empCode: string,
  ) {
    const emp = await this.ds.query(
      `SELECT id, employee_id, employee_code, employee_name, total_days, days_present, lop_days, ncp_days, ot_hours, gross_earnings, total_deductions, net_pay, state_code
       FROM payroll_run_employees WHERE run_id = $1 AND employee_code = $2 LIMIT 1`,
      [runId, empCode],
    );
    const run = await this.ds.query(
      `SELECT client_id FROM payroll_runs WHERE id = $1`,
      [runId],
    );
    const clientId = run[0]?.client_id;
    const setup = await this.ds.query(
      `SELECT pf_enabled, esi_enabled, pt_enabled, pf_employer_rate, pf_employee_rate, pf_wage_ceiling, pf_gross_threshold, esi_employer_rate, esi_employee_rate, esi_wage_ceiling
       FROM payroll_client_setup WHERE client_id = $1`,
      [clientId],
    );
    const trace = await this.ds.query(
      `SELECT trace FROM pay_calc_traces WHERE run_id = $1 AND employee_id = $2 LIMIT 1`,
      [runId, emp[0]?.employee_id],
    );
    const compValues = await this.ds.query(
      `SELECT component_code, amount, source FROM payroll_run_component_values WHERE run_employee_id = $1 ORDER BY component_code`,
      [emp[0]?.id],
    );
    return {
      employee: emp[0],
      setup: setup[0],
      trace: trace[0]?.trace,
      componentValues: compValues,
    };
  }

  // Update employee PF/ESI applicability flags from attached data
  @Post('update-employee-statutory-flags')
  @Roles('ADMIN')
  async updateEmployeeStatutoryFlags(
    @Body()
    body: {
      clientId: string;
      flags: Array<{
        empCode: string;
        pfApplicable: boolean;
        esiApplicable: boolean;
      }>;
    },
  ) {
    const { clientId, flags } = body;
    let updated = 0;
    const notFound: string[] = [];
    for (const f of flags) {
      const result = await this.ds.query(
        `UPDATE employees SET pf_applicable = $1, esi_applicable = $2
         WHERE client_id = $3 AND employee_code = $4 AND is_active = TRUE`,
        [f.pfApplicable, f.esiApplicable, clientId, f.empCode],
      );
      if (result[1] > 0) {
        updated++;
      } else {
        notFound.push(f.empCode);
      }
    }
    return { ok: true, updated, notFound };
  }

  // Patch attendance data for a run (fix LOP, add OTHER_EARNINGS, etc.)
  @Post('patch-attendance/:runId')
  @Roles('ADMIN')
  async patchAttendance(
    @Param('runId') runId: string,
    @Body()
    body: {
      totalPayable: number;
      data: Array<{
        empCode: string;
        workedDays: number;
        payableDays: number;
        otherEarnings: number;
        arrearAttBonus: number;
        otherDeductions: number;
      }>;
    },
  ) {
    const { totalPayable, data } = body;
    let patched = 0;
    const notFound: string[] = [];

    for (const row of data) {
      const lopDays = Math.max(0, totalPayable - row.payableDays);

      // Update run employee
      const upd = await this.ds.query(
        `UPDATE payroll_run_employees
         SET total_days = $1, days_present = $2, lop_days = $3, ncp_days = $3
         WHERE run_id = $4 AND employee_code = $5`,
        [totalPayable, row.payableDays, lopDays, runId, row.empCode],
      );
      if (upd[1] === 0) {
        notFound.push(row.empCode);
        continue;
      }

      // Get run employee id
      const empRow = await this.ds.query(
        `SELECT id FROM payroll_run_employees WHERE run_id = $1 AND employee_code = $2 LIMIT 1`,
        [runId, row.empCode],
      );
      if (!empRow.length) continue;
      const runEmpId = empRow[0].id;

      // Upsert LOP_DAYS
      await this.ds.query(
        `INSERT INTO payroll_run_component_values (id, run_id, run_employee_id, component_code, amount, source)
         VALUES (gen_random_uuid(), $1, $2, 'LOP_DAYS', $3, 'UPLOADED')
         ON CONFLICT (run_employee_id, component_code) DO UPDATE SET amount = $3, source = 'UPLOADED'`,
        [runId, runEmpId, String(lopDays)],
      );

      // Upsert WORKED_DAYS and PAYABLE_DAYS
      await this.ds.query(
        `INSERT INTO payroll_run_component_values (id, run_id, run_employee_id, component_code, amount, source)
         VALUES (gen_random_uuid(), $1, $2, 'WORKED_DAYS', $3, 'UPLOADED')
         ON CONFLICT (run_employee_id, component_code) DO UPDATE SET amount = $3, source = 'UPLOADED'`,
        [runId, runEmpId, String(row.workedDays)],
      );
      await this.ds.query(
        `INSERT INTO payroll_run_component_values (id, run_id, run_employee_id, component_code, amount, source)
         VALUES (gen_random_uuid(), $1, $2, 'PAYABLE_DAYS', $3, 'UPLOADED')
         ON CONFLICT (run_employee_id, component_code) DO UPDATE SET amount = $3, source = 'UPLOADED'`,
        [runId, runEmpId, String(row.payableDays)],
      );

      // Upsert OTHER_EARNINGS (always, even if 0 to clear stale values)
      await this.ds.query(
        `INSERT INTO payroll_run_component_values (id, run_id, run_employee_id, component_code, amount, source)
         VALUES (gen_random_uuid(), $1, $2, 'OTHER_EARNINGS', $3, 'UPLOADED')
         ON CONFLICT (run_employee_id, component_code) DO UPDATE SET amount = $3, source = 'UPLOADED'`,
        [runId, runEmpId, String(row.otherEarnings)],
      );

      // Upsert ARREAR_ATT_BONUS (past period attendance bonus, excluded from ESI)
      await this.ds.query(
        `INSERT INTO payroll_run_component_values (id, run_id, run_employee_id, component_code, amount, source)
         VALUES (gen_random_uuid(), $1, $2, 'ARREAR_ATT_BONUS', $3, 'UPLOADED')
         ON CONFLICT (run_employee_id, component_code) DO UPDATE SET amount = $3, source = 'UPLOADED'`,
        [runId, runEmpId, String(row.arrearAttBonus || 0)],
      );

      // Upsert OTHER_DEDUCTIONS if > 0
      if (row.otherDeductions > 0) {
        await this.ds.query(
          `INSERT INTO payroll_run_component_values (id, run_id, run_employee_id, component_code, amount, source)
           VALUES (gen_random_uuid(), $1, $2, 'OTHER_DEDUCTIONS', $3, 'UPLOADED')
           ON CONFLICT (run_employee_id, component_code) DO UPDATE SET amount = $3, source = 'UPLOADED'`,
          [runId, runEmpId, String(row.otherDeductions)],
        );
      }

      patched++;
    }

    return { ok: true, patched, notFound, totalPayable };
  }
}
