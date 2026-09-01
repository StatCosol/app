import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { PayrollClientPayslipLayoutEntity } from '../entities/payroll-client-payslip-layout.entity';
import { PayrollPayslipArchiveEntity } from '../entities/payroll-payslip-archive.entity';
import { ClientEntity } from '../../clients/entities/client.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { LeaveLedgerEntity } from '../../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../../ess/entities/leave-balance.entity';
import { LeavePolicyEntity } from '../../ess/entities/leave-policy.entity';
import { AttendanceService } from '../../attendance/attendance.service';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';
import {
  createDoc,
  toBuffer,
  addPageNumbers,
} from '../../common/utils/pdf-helpers';
import { loadLogoBuffer } from '../utils/payslip-pdf';

@Injectable()
export class PayslipGeneratorService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(PayrollComponentEntity)
    private readonly compRepo: Repository<PayrollComponentEntity>,
    @InjectRepository(PayrollClientSetupEntity)
    private readonly _setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(PayrollClientPayslipLayoutEntity)
    private readonly layoutRepo: Repository<PayrollClientPayslipLayoutEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly archiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(LeavePolicyEntity)
    private readonly leavePolicyRepo: Repository<LeavePolicyEntity>,
    private readonly attendanceService: AttendanceService,
    private readonly access: AccessScopeService,
  ) {}

  private readonly UPLOADS_DIR = path.join(
    process.cwd(),
    'uploads',
    'payslips',
  );

  /** Generate payslip PDF for a single employee in a run */
  async generateForEmployee(
    runId: string,
    employeeId: string,
    generatedByUserId: string,
    caller?: ReqUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    // runId and employeeId arrive straight from the URL and nothing here was
    // scoped — `generatedByUserId` is only stamped on the archive record, it
    // never authorised anything. A CLIENT user could name another company's
    // run and download that employee's payslip: salary, deductions, PF, the
    // lot. ScopeGuard cannot help because the request carries no clientId.
    if (caller) await this.access.assertClientAllowed(caller, run.clientId);

    const runEmp = await this.runEmpRepo.findOne({
      where: { runId, employeeId },
    });
    if (!runEmp) throw new NotFoundException('Employee not found in run');

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId },
    });

    const employee = await this.empRepo.findOne({
      where: { id: employeeId },
    });

    const components = await this.compRepo.find({
      where: { clientId: run.clientId, isActive: true },
      order: { displayOrder: 'ASC' },
    });

    const values = await this.compValRepo.find({
      where: { runId, runEmployeeId: runEmp.id },
    });
    const valueMap = new Map(
      values.map((v) => [v.componentCode, Number(v.amount)]),
    );

    // Enrich with leave/attendance data if missing
    await this.enrichValueMap(
      valueMap,
      runEmp.employeeId ?? null,
      run.clientId,
      run.periodYear,
      run.periodMonth,
    );

    const layout = await this.layoutRepo.findOne({
      where: { clientId: run.clientId },
    });

    const buffer = await this.renderPayslipPdf({
      run,
      runEmp,
      client,
      employee,
      components,
      valueMap,
      layout,
    });

    const monthStr = String(run.periodMonth).padStart(2, '0');
    const fileName = `Payslip_${runEmp.employeeCode}_${run.periodYear}_${monthStr}.pdf`;

    // Archive the payslip
    await this.archivePayslip(run, runEmp, buffer, fileName, generatedByUserId);

    return { buffer, fileName };
  }

  /** Batch generate payslips for all employees in a run */
  async generateForRun(
    runId: string,
    generatedByUserId: string,
    caller?: ReqUser,
  ): Promise<{ generated: number; errors: string[] }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    // Same exposure as generateForEmployee, for a whole run at once.
    if (caller) await this.access.assertClientAllowed(caller, run.clientId);

    const employees = await this.runEmpRepo.find({ where: { runId } });
    let generated = 0;
    const errors: string[] = [];

    for (const emp of employees) {
      if (!emp.employeeId) {
        errors.push(`${emp.employeeCode}: No linked employee ID`);
        continue;
      }
      try {
        await this.generateForEmployee(
          runId,
          emp.employeeId,
          generatedByUserId,
        );
        generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${emp.employeeCode}: ${msg}`);
      }
    }

    return { generated, errors };
  }

  private async renderPayslipPdf(params: {
    run: PayrollRunEntity;
    runEmp: PayrollRunEmployeeEntity;
    client: ClientEntity | null;
    employee: EmployeeEntity | null;
    components: PayrollComponentEntity[];
    valueMap: Map<string, number>;
    layout: PayrollClientPayslipLayoutEntity | null;
  }): Promise<Buffer> {
    const {
      run,
      runEmp,
      client,
      employee,
      components: _components,
      valueMap,
    } = params;
    const doc = createDoc();

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const periodLabel = `${monthNames[run.periodMonth - 1]} ${run.periodYear}`;
    const startX = 40;
    const pageWidth = doc.page.width - 80; // usable width

    // ── Logo above Company Name ──
    const logoBuffer = loadLogoBuffer(client?.logoUrl);
    if (logoBuffer) {
      try {
        const logoFitW = 80;
        const logoFitH = 40;
        const logoX = (doc.page.width - logoFitW) / 2;
        const logoY = doc.y;
        doc.image(logoBuffer, logoX, logoY, {
          fit: [logoFitW, logoFitH],
          align: 'center',
          valign: 'center',
        });
        doc.y = logoY + logoFitH + 6;
      } catch {
        // skip logo if unsupported format
      }
    }

    // ── Company Header (centered) ──
    doc
      .fontSize(16)
      .fillColor('#000000')
      .text((client?.clientName ?? 'Company').toUpperCase(), startX, doc.y, {
        align: 'center',
        width: pageWidth,
      });
    doc.moveDown(0.2);

    if (client?.registeredAddress) {
      doc
        .fontSize(8)
        .fillColor('#333333')
        .text(client.registeredAddress, startX, doc.y, {
          align: 'center',
          width: pageWidth,
        });
      doc.moveDown(0.4);
    }

    // ── Title: PAYSLIP ──
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor('#000000').text('PAYSLIP', startX, doc.y, {
      align: 'center',
      width: pageWidth,
      underline: true,
    });
    doc.moveDown(1);

    // ── Employee Info ──
    const infoLabelWidth = 120;
    const leftCol = startX;
    const rightCol = startX + pageWidth / 2 + 20;

    let infoY = doc.y;
    const infoFontSize = 10;

    // Row 1: Employee Name
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Employee Name:', leftCol, infoY, { continued: false });
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(
        runEmp.employeeName || '_______________',
        leftCol + infoLabelWidth,
        infoY,
      );
    infoY += 18;

    // Row 2: Employee ID + Designation
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Employee ID:', leftCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(
        runEmp.employeeCode || '_______________',
        leftCol + infoLabelWidth,
        infoY,
      );
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Designation:', rightCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(
        runEmp.designation || employee?.designation || '_______________',
        rightCol + 100,
        infoY,
      );
    infoY += 18;

    // Row 3: Month + Date of Joining
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Month:', leftCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(periodLabel, leftCol + infoLabelWidth, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Date of Joining:', rightCol, infoY);
    const doj = employee?.dateOfJoining
      ? new Date(employee.dateOfJoining).toLocaleDateString('en-IN')
      : '_______________';
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(doj, rightCol + 100, infoY);
    infoY += 18;

    // Row 4: UAN + ESIC
    if (runEmp.uan || runEmp.esic) {
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text('UAN:', leftCol, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text(runEmp.uan || '_______________', leftCol + infoLabelWidth, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text('ESIC:', rightCol, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text(runEmp.esic || '_______________', rightCol + 100, infoY);
      infoY += 18;
    }

    // ── Attendance / Leave Summary ──
    const workedDays = valueMap.get('WORKED_DAYS') ?? 0;
    const payableDays = valueMap.get('PAYABLE_DAYS') ?? 0;
    const lopDays = valueMap.get('LOP_DAYS') ?? 0;
    const holidays = valueMap.get('HOLIDAYS') ?? 0;
    const elPaidLeaveDays = valueMap.get('EL_PAID_LEAVE_DAYS') ?? 0;
    const plAvailed = valueMap.get('PL_DAYS') ?? elPaidLeaveDays;
    const slAvailed = valueMap.get('SL_DAYS') ?? 0;
    const plEarned = valueMap.get('EL_ACCRUED') ?? 0;
    const slEarned = valueMap.get('SL_ACCRUED') ?? 0;
    const plBalance = Math.max(valueMap.get('EL_BALANCE') ?? 0, 0);
    const slBalance = Math.max(valueMap.get('SL_BALANCE') ?? 0, 0);
    const showSlSummary = slAvailed !== 0 || slEarned !== 0 || slBalance !== 0;
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Days Worked:', leftCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(workedDays), leftCol + infoLabelWidth, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Payable Days:', rightCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(payableDays), rightCol + 100, infoY);
    infoY += 18;

    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('Holidays:', leftCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(holidays), leftCol + infoLabelWidth, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('LOP Days:', rightCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(lopDays), rightCol + 100, infoY);
    infoY += 18;

    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('PL Earned:', leftCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(plEarned), leftCol + infoLabelWidth, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('PL Availed:', rightCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(plAvailed), rightCol + 100, infoY);
    infoY += 18;

    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text('PL Balance:', leftCol, infoY);
    doc
      .fontSize(infoFontSize)
      .fillColor('#000000')
      .text(String(plBalance), leftCol + infoLabelWidth, infoY);
    if (showSlSummary) {
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text('SL Availed:', rightCol, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text(String(slAvailed), rightCol + 100, infoY);
    }
    infoY += 18;

    if (showSlSummary) {
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text('SL Earned:', leftCol, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text(String(slEarned), leftCol + infoLabelWidth, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text('SL Balance:', rightCol, infoY);
      doc
        .fontSize(infoFontSize)
        .fillColor('#000000')
        .text(String(slBalance), rightCol + 100, infoY);
      infoY += 18;
    }
    infoY += 6;

    doc.y = infoY;

    // ── Compute earnings breakdown ──
    const basic = valueMap.get('BASIC') ?? 0;
    const hra = valueMap.get('HRA') ?? 0;
    const others = valueMap.get('OTHERS') ?? 0;
    const attBonus = valueMap.get('ATT_BONUS') ?? 0;
    const gross = valueMap.get('GROSS') ?? 0;
    // Use explicit OTHER_EARNINGS when supplied via the Preview Employees
    // grid; fall back to the gross-residual for legacy structures.
    const otherEarningsExplicit = valueMap.get('OTHER_EARNINGS') ?? 0;
    const arrearAttBonus = valueMap.get('ARREAR_ATT_BONUS') ?? 0;
    const otAmount = valueMap.get('OT_AMOUNT') ?? 0;
    // Show OT pay as part of "Other Earnings" rather than its own row.
    const otherEarningsBase =
      otherEarningsExplicit > 0
        ? otherEarningsExplicit
        : Math.max(0, gross - basic - hra - others - attBonus);
    const otherEarningsRow = otherEarningsBase + otAmount;
    const otherEarningsNoteParts: string[] = [];
    if ((runEmp as any).otherEarningsNote)
      otherEarningsNoteParts.push((runEmp as any).otherEarningsNote);
    if (otAmount > 0) otherEarningsNoteParts.push('incl. OT');
    const otherEarningsLabel = otherEarningsNoteParts.length
      ? `Other Earnings (${otherEarningsNoteParts.join(', ')})`
      : 'Other Earnings';

    // ── Compute deductions summary ──
    const pfAmt = valueMap.get('PF_EMP') ?? 0;
    const esiAmt = valueMap.get('ESI_EMP') ?? 0;
    const ptAmt = valueMap.get('PT') ?? 0;
    const pfErFromEmpAmt = valueMap.get('PF_ER_FROM_EMP') ?? 0;
    const tdsAmt = valueMap.get('TDS') ?? 0;
    const otherDeductions = valueMap.get('OTHER_DEDUCTIONS') ?? 0;
    const otherDeductionsLabel = (runEmp as any).otherDeductionsNote
      ? `Other Deductions (${(runEmp as any).otherDeductionsNote})`
      : 'Other Deductions';
    const totalDeduction =
      pfAmt + esiAmt + ptAmt + pfErFromEmpAmt + otherDeductions;

    const netPay = Number(valueMap.get('NET_PAY') ?? runEmp.netPay ?? 0);

    // ── Draw Table ──
    const tableX = startX;
    const tableWidth = pageWidth;
    const halfWidth = tableWidth / 2;
    const col1X = tableX; // "Earnings" label
    const col3X = tableX + halfWidth; // "Deductions" label
    const rowHeight = 24;
    const cellPadX = 6;
    const cellPadY = 7;
    let tY = doc.y;

    const drawCellBorders = (x: number, y: number, w: number, h: number) => {
      doc.strokeColor('#000000').lineWidth(0.5).rect(x, y, w, h).stroke();
    };

    // Helper to draw a row with 4 cells
    const drawRow = (
      label1: string,
      val1: string,
      label2: string,
      val2: string,
      y: number,
      bold = false,
    ) => {
      const labelW = halfWidth - 80;
      const amtW = 80;
      drawCellBorders(col1X, y, labelW, rowHeight);
      drawCellBorders(col1X + labelW, y, amtW, rowHeight);
      drawCellBorders(col3X, y, labelW, rowHeight);
      drawCellBorders(col3X + labelW, y, amtW, rowHeight);

      const fs = bold ? 10 : 9;
      doc.fontSize(fs).fillColor('#000000');
      if (bold) doc.font('Helvetica-Bold');
      else doc.font('Helvetica');
      doc.text(label1, col1X + cellPadX, y + cellPadY, {
        width: labelW - cellPadX * 2,
      });
      doc
        .fontSize(fs)
        .fillColor('#000000')
        .text(val1, col1X + labelW + cellPadX, y + cellPadY, {
          width: amtW - cellPadX * 2,
          align: 'right',
        });
      doc
        .fontSize(fs)
        .fillColor('#000000')
        .text(label2, col3X + cellPadX, y + cellPadY, {
          width: labelW - cellPadX * 2,
        });
      doc
        .fontSize(fs)
        .fillColor('#000000')
        .text(val2, col3X + labelW + cellPadX, y + cellPadY, {
          width: amtW - cellPadX * 2,
          align: 'right',
        });
      doc.font('Helvetica');
    };

    // Header row
    drawRow('Earnings', 'Amount', 'Deductions', 'Amount', tY, true);
    tY += rowHeight;

    // Row 1: Basic / PF
    drawRow(
      'Basic',
      this.formatCurrency(basic),
      'PF',
      this.formatCurrency(pfAmt),
      tY,
    );
    tY += rowHeight;

    // Row 2: HRA / ESI
    drawRow(
      'HRA',
      this.formatCurrency(hra),
      'ESI',
      this.formatCurrency(esiAmt),
      tY,
    );
    tY += rowHeight;

    // Row 3: Others / PT
    drawRow(
      'Others',
      this.formatCurrency(others),
      'PT',
      this.formatCurrency(ptAmt),
      tY,
    );
    tY += rowHeight;

    // Att. Bonus row — paired with PF Employer if applicable
    if (attBonus > 0 || pfErFromEmpAmt > 0) {
      drawRow(
        attBonus > 0 ? 'Att. Bonus' : '',
        attBonus > 0 ? this.formatCurrency(attBonus) : '',
        pfErFromEmpAmt > 0 ? 'PF Employer' : '',
        pfErFromEmpAmt > 0 ? this.formatCurrency(pfErFromEmpAmt) : '',
        tY,
      );
      tY += rowHeight;
    }

    // Other Earnings (explicit user-entered amount or gross-residual)
    if (otherEarningsRow > 0) {
      drawRow(
        otherEarningsLabel,
        this.formatCurrency(otherEarningsRow),
        '',
        '',
        tY,
      );
      tY += rowHeight;
    }

    // Arrear / Att. Bonus row when present (separate from Att. Bonus)
    if (arrearAttBonus > 0) {
      drawRow(
        'Arrear / Att. Bonus',
        this.formatCurrency(arrearAttBonus),
        '',
        '',
        tY,
      );
      tY += rowHeight;
    }

    // OT Amount is included inside the Other Earnings row above; no separate row.

    // Other Deductions (user-supplied) on the deductions side
    if (otherDeductions > 0) {
      drawRow(
        '',
        '',
        otherDeductionsLabel,
        this.formatCurrency(otherDeductions),
        tY,
      );
      tY += rowHeight;
    }

    // Row 4: Gross / Total Deduction
    drawRow(
      'Gross',
      this.formatCurrency(gross + otAmount),
      'Total Deduction',
      this.formatCurrency(totalDeduction),
      tY,
      true,
    );
    tY += rowHeight;

    // Row 5: Net Pay (spans full width)
    const netLabelW = halfWidth - 80;
    const netAmtW = 80;
    // Draw 3 cells: label, first amount area, rest blank
    drawCellBorders(col1X, tY, netLabelW, rowHeight);
    drawCellBorders(col1X + netLabelW, tY, netAmtW, rowHeight);
    drawCellBorders(col3X, tY, halfWidth, rowHeight);

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Net Pay', col1X + cellPadX, tY + cellPadY, {
        width: netLabelW - cellPadX * 2,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text(
        this.formatCurrency(netPay),
        col1X + netLabelW + cellPadX,
        tY + cellPadY,
        {
          width: netAmtW - cellPadX * 2,
          align: 'right',
        },
      );
    doc.font('Helvetica');
    tY += rowHeight;

    doc.y = tY + 20;

    // ── Employer Contributions ──
    // When PF_ER_FROM_EMP > 0 the employer PF is already deducted from the
    // employee's salary, so we do NOT show it again as an employer contribution.
    const pfEr = valueMap.get('PF_ER') ?? 0;
    const esiEr = valueMap.get('ESI_ER') ?? 0;
    const showPfEr = pfEr > 0 && pfErFromEmpAmt === 0;

    if (showPfEr || esiEr > 0) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000000')
        .text('Employer Contributions:', startX, doc.y);
      doc.font('Helvetica');
      doc.moveDown(0.4);

      if (showPfEr) {
        doc
          .fontSize(10)
          .fillColor('#000000')
          .text(`PF Employer: ${this.formatCurrency(pfEr)}`, startX, doc.y);
        doc.moveDown(0.3);
      }
      if (esiEr > 0) {
        doc
          .fontSize(10)
          .fillColor('#000000')
          .text(`ESI Employer: ${this.formatCurrency(esiEr)}`, startX, doc.y);
        doc.moveDown(0.3);
      }
    }

    // ── Authorized Signatory ──
    doc.moveDown(3);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Authorized Signatory', startX, doc.y);
    doc.font('Helvetica');

    // ── Income Tax (TDS) note — informational only, not deducted ──
    {
      const tdsBasis = valueMap.get('TDS_ANNUAL_BASIS') ?? 0;
      doc.moveDown(1.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#000000')
        .text(
          `Income Tax (TDS) for the month: ${this.formatCurrency(tdsAmt)}`,
          startX,
          doc.y,
        );
      const explain =
        tdsBasis > 0
          ? `Computed on annual gross ${this.formatCurrency(tdsBasis)} as per Income Tax Act (FY 2025-26, New Regime, std. deduction ₹75,000, 87A rebate up to taxable ₹12,00,000). Shown for information only — not deducted from this payslip.`
          : 'No annual gross basis available for the employee — set Monthly Gross or CTC in Employee master to enable TDS projection. Shown for information only — not deducted from this payslip.';
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#555555')
        .text(explain, startX, doc.y + 2, { width: pageWidth });
      doc.font('Helvetica').fillColor('#000000');
    }

    addPageNumbers(doc);

    return toBuffer(doc);
  }

  private async archivePayslip(
    run: PayrollRunEntity,
    runEmp: PayrollRunEmployeeEntity,
    buffer: Buffer,
    fileName: string,
    generatedByUserId: string,
  ) {
    // Ensure directory exists
    const dirPath = path.join(
      this.UPLOADS_DIR,
      run.clientId,
      `${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}`,
    );
    fs.mkdirSync(dirPath, { recursive: true });

    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, buffer);

    // Upsert archive record
    const existing = await this.archiveRepo.findOne({
      where: { runId: run.id, employeeCode: runEmp.employeeCode },
    });

    if (existing) {
      existing.fileName = fileName;
      existing.fileSize = String(buffer.length);
      existing.filePath = filePath;
      existing.generatedByUserId = generatedByUserId;
      existing.generatedAt = new Date();
      await this.archiveRepo.save(existing);
    } else {
      await this.archiveRepo.save(
        this.archiveRepo.create({
          runId: run.id,
          clientId: run.clientId,
          branchId: runEmp.branchId,
          employeeCode: runEmp.employeeCode,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          fileName,
          fileType: 'application/pdf',
          fileSize: String(buffer.length),
          filePath,
          generatedByUserId,
        }),
      );
    }
  }

  private formatCurrency(n: number): string {
    return 'Rs.' + Math.round(n).toLocaleString('en-IN');
  }

  /**
   * Enrich a valueMap with leave/attendance data computed from source tables
   * when the values are missing (runs processed before these were added to engine).
   */
  private async enrichValueMap(
    valueMap: Map<string, number>,
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
        const allElEntries = await this.leaveLedgerRepo.find({
          where: { employeeId, leaveType: 'EL' },
        });
        let accrued = 0;
        for (const entry of allElEntries) {
          if (
            entry.refType === 'EL_ACCRUAL' &&
            entry.remarks?.includes(monthStr)
          ) {
            accrued += Math.abs(Number(entry.qty) || 0);
          }
        }
        valueMap.set('EL_ACCRUED', Math.round(accrued * 100) / 100);
      } catch {
        if (valueMap.has('WORKED_DAYS')) {
          const workedDays = valueMap.get('WORKED_DAYS') ?? 0;
          valueMap.set('EL_ACCRUED', Math.round((workedDays / 20) * 100) / 100);
        } else if (!valueMap.has('EL_ACCRUED')) {
          valueMap.set('EL_ACCRUED', 0);
        }
      }
    } else {
      if (valueMap.has('WORKED_DAYS')) {
        const workedDays = valueMap.get('WORKED_DAYS') ?? 0;
        valueMap.set('EL_ACCRUED', Math.round((workedDays / 20) * 100) / 100);
      } else if (!valueMap.has('EL_ACCRUED')) {
        valueMap.set('EL_ACCRUED', 0);
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
        valueMap.set('EL_PAID_LEAVE_DAYS', paidLeaveDays);
      } catch {
        if (!valueMap.has('EL_PAID_LEAVE_DAYS'))
          valueMap.set('EL_PAID_LEAVE_DAYS', 0);
      }

      // ── EL_BALANCE: as-of end of payslip month ──
      // The yearly leave_balances.available is a year-running aggregate that
      // includes accruals for FUTURE months (e.g. May accrual booked Apr 30).
      // For the payslip we want the balance AS OF THE PAYSLIP MONTH only:
      //   opening + Σaccruals(month<=payslipMonth) − Σused(month<=payslipMonth)
      // The benefit month is encoded in the ledger remarks ("EL accrual for YYYY-MM: …")
      // which is independent of entry_date (often booked on the prior month-end).
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
          // Fallback to entry_date year/month if no tag in remarks.
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
        const balance = Math.max(
          Math.round((opening + accrual - used) * 100) / 100,
          0,
        );
        valueMap.set('EL_BALANCE', balance);
      } catch {
        if (!valueMap.has('EL_BALANCE')) valueMap.set('EL_BALANCE', 0);
      }
    } else {
      if (!valueMap.has('EL_PAID_LEAVE_DAYS'))
        valueMap.set('EL_PAID_LEAVE_DAYS', 0);
      if (!valueMap.has('EL_BALANCE')) valueMap.set('EL_BALANCE', 0);
    }

    if (!hasSlPolicy && !Number(valueMap.get('SL_DAYS') || 0)) {
      valueMap.set('SL_ACCRUED', 0);
      valueMap.set('SL_BALANCE', 0);
      valueMap.set('SL_DAYS', 0);
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
        valueMap.set('HOLIDAYS', empSummary?.holidays ?? 0);
        valueMap.set('WEEK_OFFS', empSummary?.weekOffs ?? 0);
      }
    } catch {
      if (!valueMap.has('HOLIDAYS')) valueMap.set('HOLIDAYS', 0);
    }
  }
}
