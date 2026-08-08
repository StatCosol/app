import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { LeaveLedgerEntity } from '../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { LeavePolicyEntity } from '../ess/entities/leave-policy.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { HolidayCalendarService } from '../attendance/holiday-calendar.service';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { generatePayslipPdfBuffer, loadLogoBuffer } from './utils/payslip-pdf';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollPayslipsService {
  private readonly logger = new Logger(PayrollPayslipsService.name);

  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly payslipArchiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(LeavePolicyEntity)
    private readonly leavePolicyRepo: Repository<LeavePolicyEntity>,
    private readonly attendanceService: AttendanceService,
    private readonly holidayService: HolidayCalendarService,
    private readonly scope: PayrollClientScopeService,
  ) {}

  private async enrichLeaveAttendanceValues(
    cv: Record<string, number>,
    employeeId: string | null,
    clientId: string,
    year: number,
    month: number,
  ): Promise<void> {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const hasSlPolicy =
      (await this.leavePolicyRepo.count({
        where: { clientId, leaveType: 'SL', isActive: true },
      })) > 0;

    // ── EL_ACCRUED: read from ledger if available, else compute from WORKED_DAYS / 20 ──
    if (employeeId) {
      try {
        const elEntries = await this.leaveLedgerRepo.find({
          where: { employeeId, leaveType: 'EL' },
        });
        let accrued = 0;
        for (const entry of elEntries) {
          if (
            entry.refType === 'EL_ACCRUAL' &&
            entry.remarks?.includes(monthStr)
          ) {
            accrued += Math.abs(Number(entry.qty) || 0);
          }
        }
        cv['EL_ACCRUED'] = Math.round(accrued * 100) / 100;
      } catch {
        // Fallback to formula
        if (cv['WORKED_DAYS'] !== undefined) {
          cv['EL_ACCRUED'] = Math.round((cv['WORKED_DAYS'] / 20) * 100) / 100;
        } else if (cv['EL_ACCRUED'] === undefined) {
          cv['EL_ACCRUED'] = 0;
        }
      }
    } else {
      if (cv['WORKED_DAYS'] !== undefined) {
        cv['EL_ACCRUED'] = Math.round((cv['WORKED_DAYS'] / 20) * 100) / 100;
      } else if (cv['EL_ACCRUED'] === undefined) {
        cv['EL_ACCRUED'] = 0;
      }
    }

    // ── EL_PAID_LEAVE_DAYS: from leave ledger ──
    if (employeeId) {
      try {
        const elEntries = await this.leaveLedgerRepo.find({
          where: { employeeId, leaveType: 'EL' },
        });
        let paidLeaveDays = 0;
        for (const entry of elEntries) {
          if (
            entry.refType === 'EL_PAID_LEAVE' &&
            entry.remarks?.includes(monthStr)
          ) {
            paidLeaveDays += Math.abs(Number(entry.qty) || 0);
          }
        }
        cv['EL_PAID_LEAVE_DAYS'] = paidLeaveDays;
      } catch {
        if (cv['EL_PAID_LEAVE_DAYS'] === undefined)
          cv['EL_PAID_LEAVE_DAYS'] = 0;
      }

      // ── EL_BALANCE: as-of end of payslip month ──
      // Year-aggregate available includes future-month accruals (e.g. May
      // accrual booked Apr 30). For this month's view, sum opening + ledger
      // entries whose tagged benefit month <= current month.
      try {
        const elBal = await this.leaveBalanceRepo.findOne({
          where: { employeeId, year, leaveType: 'EL' },
        });
        const opening = elBal ? parseFloat(elBal.opening) || 0 : 0;
        const allEl = await this.leaveLedgerRepo.find({
          where: { employeeId, leaveType: 'EL' },
        });
        const tagRe = /(\d{4})-(\d{2})/;
        let accrual = 0;
        let used = 0;
        for (const entry of allEl) {
          const m = entry.remarks?.match(tagRe);
          let entryYear: number;
          let entryMonth: number;
          if (m) {
            entryYear = Number(m[1]);
            entryMonth = Number(m[2]);
          } else {
            const d = new Date(entry.entryDate as unknown as string);
            entryYear = d.getUTCFullYear();
            entryMonth = d.getUTCMonth() + 1;
          }
          if (entryYear !== year) continue;
          if (entryMonth > month) continue;
          const qty = Math.abs(Number(entry.qty) || 0);
          if (entry.refType === 'EL_ACCRUAL') {
            accrual += qty;
          } else if (entry.refType === 'EL_PAID_LEAVE') used += qty;
        }
        cv['EL_BALANCE'] = Math.max(
          Math.round((opening + accrual - used) * 100) / 100,
          0,
        );
      } catch {
        if (cv['EL_BALANCE'] === undefined) cv['EL_BALANCE'] = 0;
      }
    } else {
      if (cv['EL_PAID_LEAVE_DAYS'] === undefined) cv['EL_PAID_LEAVE_DAYS'] = 0;
      if (cv['EL_BALANCE'] === undefined) cv['EL_BALANCE'] = 0;
    }

    if (!hasSlPolicy && !Number(cv['SL_DAYS'] || 0)) {
      cv['SL_ACCRUED'] = 0;
      cv['SL_BALANCE'] = 0;
      cv['SL_DAYS'] = 0;
    }

    // ── HOLIDAYS: always recompute from attendance ──
    try {
      const summaries = await this.attendanceService.getMonthlySummary({
        clientId,
        year,
        month,
      });
      if (employeeId) {
        const empSummary = summaries.find((s) => s.employeeId === employeeId);
        cv['HOLIDAYS'] = empSummary?.holidays ?? 0;
        cv['WEEK_OFFS'] = empSummary?.weekOffs ?? 0;
      }
    } catch {
      if (cv['HOLIDAYS'] === undefined) cv['HOLIDAYS'] = 0;
    }

    // ── Holiday-work double wage: HR-approved days that were worked on a
    // holiday get an extra day's wage (making that day 2x). Additive only —
    // stays 0 unless HR approved holiday-work for this employee/month.
    try {
      if (employeeId) {
        const dbl = await this.holidayService.getApprovedHolidayWorkDays(
          clientId,
          year,
          month,
        );
        cv['HOLIDAY_DBL_DAYS'] = dbl[employeeId] ?? 0;
      }
    } catch {
      if (cv['HOLIDAY_DBL_DAYS'] === undefined) cv['HOLIDAY_DBL_DAYS'] = 0;
    }
  }


  async listPayrollRunEmployees(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.scope.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const rows = await this.runEmployeeRepo.find({
      where: { runId },
      order: { employeeName: 'ASC' },
    });

    // Fetch component metadata for the client (for column ordering / labels)
    const components = await this.runEmployeeRepo.manager.query(
      `SELECT code, name, component_type, display_order
       FROM payroll_components
       WHERE client_id = $1 AND is_active = TRUE
       ORDER BY display_order ASC, code ASC`,
      [run.clientId],
    );
    const componentMeta = components.map((c: any) => ({
      code: c.code,
      name: c.name,
      type: c.component_type,
      displayOrder: Number(c.display_order || 0),
    }));

    // Fetch all component values for this run in a single query
    const valueRows = await this.runEmployeeRepo.manager.query(
      `SELECT run_employee_id, component_code, amount
       FROM payroll_run_component_values
       WHERE run_id = $1`,
      [runId],
    );
    const valuesByEmp = new Map<string, Record<string, number>>();
    for (const v of valueRows) {
      const map = valuesByEmp.get(v.run_employee_id) || {};
      map[v.component_code] = Number(v.amount || 0);
      valuesByEmp.set(v.run_employee_id, map);
    }

    // Pull employee master data for designation / actual gross / PF & ESI
    // applicability so the payroll preview can show registration values.
    const empCodes = rows.map((r) => r.employeeCode).filter(Boolean);
    const empMasterByCode = new Map<
      string,
      {
        designation: string | null;
        monthlyGross: number;
        pfApplicable: boolean;
        esiApplicable: boolean;
      }
    >();
    if (empCodes.length) {
      const masterRows: Array<{
        employee_code: string;
        designation: string | null;
        monthly_gross: string | null;
        ctc: string | null;
        pf_applicable: boolean;
        esi_applicable: boolean;
      }> = await this.runEmployeeRepo.manager.query(
        `SELECT employee_code, designation, monthly_gross, ctc,
                pf_applicable, esi_applicable
         FROM employees
         WHERE client_id = $1 AND employee_code = ANY($2::text[])`,
        [run.clientId, empCodes],
      );
      for (const m of masterRows) {
        const monthly =
          Number(m.monthly_gross) || (m.ctc ? Number(m.ctc) / 12 : 0);
        empMasterByCode.set(m.employee_code, {
          designation: m.designation ?? null,
          monthlyGross: monthly || 0,
          pfApplicable: !!m.pf_applicable,
          esiApplicable: !!m.esi_applicable,
        });
      }
    }

    return {
      components: componentMeta,
      employees: rows.map((e) => {
        const master = empMasterByCode.get(e.employeeCode);
        return {
          employeeId: e.employeeCode, // IMPORTANT for downloads
          empCode: e.employeeCode,
          employeeName: e.employeeName ?? null,
          designation: master?.designation ?? e.designation ?? null,
          uan: e.uan ?? null,
          esic: e.esic ?? null,
          monthlyGross: master?.monthlyGross ?? 0,
          pfApplicable: master?.pfApplicable ?? false,
          esiApplicable: master?.esiApplicable ?? false,
          grossEarnings: Number(e.grossEarnings ?? 0),
          totalDeductions: Number(e.totalDeductions ?? 0),
          netPay: Number(e.netPay ?? 0),
          employerCost: Number((e as any).employerCost ?? 0),
          totalDays: Number(e.totalDays ?? 0),
          daysPresent: Number(e.daysPresent ?? 0),
          lopDays: Number(e.lopDays ?? 0),
          otHours: Number((e as any).otHours ?? 0),
          otherEarningsNote: (e as any).otherEarningsNote ?? null,
          otherDeductionsNote: (e as any).otherDeductionsNote ?? null,
          components: valuesByEmp.get(e.id) || {},
        };
      }),
    };
  }

  /**
   * Generate a very basic payslip PDF (summary-only) from payroll_run_employees.
   * Used by GET /api/payroll/runs/:runId/employees/:employeeId/payslip.pdf
   */
  async generatePayslipPdfForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.scope.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const emp = await this.runEmployeeRepo.findOne({
      where: { runId, employeeCode: employeeId },
    });
    if (!emp) throw new BadRequestException('Employee not found in run');

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId },
    });

    // Fetch employee record for dateOfJoining
    const employee = emp.employeeId
      ? await this.employeeRepo.findOne({ where: { id: emp.employeeId } })
      : null;

    // Fetch component values for detailed breakdown
    const cvRepo = this.runEmployeeRepo.manager.getRepository(
      PayrollRunComponentValueEntity,
    );
    const compValues = await cvRepo.find({
      where: { runId, runEmployeeId: emp.id },
    });
    const componentValues: Record<string, number> = {};
    for (const v of compValues) {
      componentValues[v.componentCode] = Number(v.amount) || 0;
    }

    // Enrich with leave/attendance data if missing
    await this.enrichLeaveAttendanceValues(
      componentValues,
      emp.employeeId ?? null,
      run.clientId,
      run.periodYear,
      run.periodMonth,
    );

    // Load client logo
    const logoBuffer = loadLogoBuffer(client?.logoUrl);

    const buffer = await generatePayslipPdfBuffer({
      header: {
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        clientName: client?.clientName ?? null,
        clientAddress: client?.registeredAddress ?? null,
        employeeName: emp.employeeName,
        empCode: emp.employeeCode,
        designation: emp.designation ?? null,
        dateOfJoining: employee?.dateOfJoining ?? null,
        uan: emp.uan ?? null,
        esic: emp.esic ?? null,
        logoBuffer,
        otherEarningsNote: (emp as any).otherEarningsNote ?? null,
        otherDeductionsNote: (emp as any).otherDeductionsNote ?? null,
      },
      componentValues,
    });

    const fileName = `payslip_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${emp.employeeCode}.pdf`;
    return { fileName, fileType: 'application/pdf', buffer };
  }

  /**
   * Download archived payslip for a payroll run/employeeCode from payroll_payslip_archives.
   */
  async downloadArchivedPayslipForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    // Generate on-the-fly with enriched values instead of reading stale archive
    return this.generatePayslipPdfForPayroll(user, runId, employeeId);
  }

  /**
   * Generate and store payslip PDFs into payroll_payslip_archives (idempotent).
   */
  async archiveRunPayslips(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.scope.assertPayrollAccessToClient(user, run.clientId);
    if (String(run.status || '').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Run must be approved before archiving/publishing payslips',
      );
    }

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId },
    });
    const employees = await this.runEmployeeRepo.find({
      where: { runId },
    });

    // Load client logo once for all employees
    const logoBuffer = loadLogoBuffer(client?.logoUrl);

    const baseDir = path.join(
      process.cwd(),
      'uploads',
      'payslips-archive',
      runId,
    );
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    let created = 0;
    let updated = 0;

    for (const emp of employees) {
      const fileName = `payslip_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${emp.employeeCode}.pdf`;
      const filePath = path.join(baseDir, fileName);

      // Fetch employee record for dateOfJoining
      const employee = emp.employeeId
        ? await this.employeeRepo.findOne({ where: { id: emp.employeeId } })
        : null;

      // Fetch component values for detailed breakdown
      const cvRepo = this.runEmployeeRepo.manager.getRepository(
        PayrollRunComponentValueEntity,
      );
      const compValues = await cvRepo.find({
        where: { runId, runEmployeeId: emp.id },
      });
      const componentValues: Record<string, number> = {};
      for (const v of compValues) {
        componentValues[v.componentCode] = Number(v.amount) || 0;
      }

      // Enrich with leave/attendance data
      await this.enrichLeaveAttendanceValues(
        componentValues,
        emp.employeeId ?? null,
        run.clientId,
        run.periodYear,
        run.periodMonth,
      );

      const buffer = await generatePayslipPdfBuffer({
        header: {
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          clientName: client?.clientName ?? null,
          clientAddress: client?.registeredAddress ?? null,
          employeeName: emp.employeeName,
          empCode: emp.employeeCode,
          designation: emp.designation ?? null,
          dateOfJoining: employee?.dateOfJoining ?? null,
          uan: emp.uan ?? null,
          esic: emp.esic ?? null,
          logoBuffer,
          otherEarningsNote: (emp as any).otherEarningsNote ?? null,
          otherDeductionsNote: (emp as any).otherDeductionsNote ?? null,
        },
        componentValues,
      });

      fs.writeFileSync(filePath, buffer);

      const existing = await this.payslipArchiveRepo.findOne({
        where: { runId, employeeCode: emp.employeeCode },
      });
      if (existing) {
        existing.fileName = fileName;
        existing.fileType = 'application/pdf';
        existing.fileSize = String(buffer.length);
        existing.filePath = filePath;
        existing.periodYear = run.periodYear;
        existing.periodMonth = run.periodMonth;
        existing.generatedByUserId = user.id;
        await this.payslipArchiveRepo.save(existing);
        updated++;
      } else {
        const row = this.payslipArchiveRepo.create({
          runId,
          clientId: run.clientId,
          branchId: run.branchId ?? null,
          employeeCode: emp.employeeCode,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          fileName,
          fileType: 'application/pdf',
          fileSize: String(buffer.length),
          filePath,
          generatedByUserId: user.id,
        });
        await this.payslipArchiveRepo.save(row);
        created++;
      }
    }

    return {
      ok: true,
      runId,
      created,
      updated,
      totalEmployees: employees.length,
    };
  }

  /**
   * Streams a ZIP of archived payslips for a run. If not archived yet, it will archive first.
   */
  async streamPayslipsZip(user: ReqUser, runId: string, res: Response) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.scope.assertPayrollAccessToClient(user, run.clientId);
    if (String(run.status || '').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Run must be approved before downloading published payslips',
      );
    }

    // Always re-archive to pick up enriched leave/attendance values
    await this.archiveRunPayslips(user, runId);

    const files = await this.payslipArchiveRepo.find({
      where: { runId },
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payslips_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${runId}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    for (const f of files) {
      if (f.filePath && fs.existsSync(f.filePath)) {
        archive.file(f.filePath, { name: f.fileName });
      }
    }

    await archive.finalize();
  }

  async listPayslips(_user: ReqUser, q: Record<string, any>) {
    try {
      const qb = this.payslipArchiveRepo.createQueryBuilder('p');
      if (q?.clientId) qb.andWhere('p.client_id = :cid', { cid: q.clientId });
      if (q?.month && q?.year) {
        qb.andWhere('p.period_month = :m AND p.period_year = :y', {
          m: Number(q.month),
          y: Number(q.year),
        });
      }
      qb.orderBy('p.generated_at', 'DESC').take(200);
      const items = await qb.getMany();
      return { items, total: items.length };
    } catch (err) {
      this.logger.error('listPayslips query failed', (err as Error)?.message);
      return { items: [], total: 0 };
    }
  }

}
