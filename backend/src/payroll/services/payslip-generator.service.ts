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
import {
  createDoc,
  toBuffer,
  header,
  addPageNumbers,
  divider,
  sectionTitle,
} from '../../common/utils/pdf-helpers';

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
    private readonly setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(PayrollClientPayslipLayoutEntity)
    private readonly layoutRepo: Repository<PayrollClientPayslipLayoutEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly archiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
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
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

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
  ): Promise<{ generated: number; errors: string[] }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

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
    const { run, runEmp, client, employee, components, valueMap } = params;
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

    // Header
    header(doc, client?.clientName ?? 'Company', `Payslip for ${periodLabel}`);

    // Employee Info
    sectionTitle(doc, 'Employee Details');

    const empInfo = [
      ['Name', runEmp.employeeName || 'N/A'],
      ['Code', runEmp.employeeCode || 'N/A'],
      ['Designation', runEmp.designation || employee?.designation || 'N/A'],
      ['Department', employee?.department || 'N/A'],
      ['UAN', runEmp.uan || 'N/A'],
      ['ESIC', runEmp.esic || 'N/A'],
      ['Bank A/c', employee?.bankAccount || 'N/A'],
      ['PAN', employee?.pan || 'N/A'],
    ];

    const infoColWidth = 250;
    const startX = 40;
    let infoY = doc.y;
    for (let i = 0; i < empInfo.length; i += 2) {
      const left = empInfo[i];
      const right = empInfo[i + 1];
      doc
        .fontSize(8)
        .fillColor('#64748b')
        .text(left[0] + ':', startX, infoY, { continued: false });
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(left[1], startX + 80, infoY);
      if (right) {
        doc
          .fontSize(8)
          .fillColor('#64748b')
          .text(right[0] + ':', startX + infoColWidth, infoY);
        doc
          .fontSize(8)
          .fillColor('#1e293b')
          .text(right[1], startX + infoColWidth + 80, infoY);
      }
      infoY += 14;
    }
    doc.y = infoY + 8;

    divider(doc);
    doc.moveDown(0.5);

    // Earnings & Deductions side by side
    const earnings = components.filter(
      (c) => c.componentType === 'EARNING' && valueMap.has(c.code),
    );
    const deductions = components.filter(
      (c) => c.componentType === 'DEDUCTION' && valueMap.has(c.code),
    );

    // Add statutory deductions
    const statDeductions: [string, number][] = [];
    if (valueMap.has('PF_EMP') && (valueMap.get('PF_EMP') ?? 0) > 0)
      statDeductions.push(['PF (Employee)', valueMap.get('PF_EMP')!]);
    if (valueMap.has('ESI_EMP') && (valueMap.get('ESI_EMP') ?? 0) > 0)
      statDeductions.push(['ESI (Employee)', valueMap.get('ESI_EMP')!]);
    if (valueMap.has('PT') && (valueMap.get('PT') ?? 0) > 0)
      statDeductions.push(['Professional Tax', valueMap.get('PT')!]);
    if (valueMap.has('LWF_EMP') && (valueMap.get('LWF_EMP') ?? 0) > 0)
      statDeductions.push(['LWF (Employee)', valueMap.get('LWF_EMP')!]);

    const colLeft = startX;
    const colRight = startX + 260;
    const colWidth = 240;

    // Earnings header
    doc.fontSize(10).fillColor('#0a2656').text('Earnings', colLeft, doc.y);
    doc
      .fontSize(10)
      .fillColor('#0a2656')
      .text('Deductions', colRight, doc.y - 12);
    doc.moveDown(0.3);

    let tableY = doc.y;

    // Earnings column
    let earningsTotal = 0;
    for (const comp of earnings) {
      const amt = valueMap.get(comp.code) ?? 0;
      earningsTotal += amt;
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(comp.name, colLeft, tableY, { width: 150 });
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(this.formatCurrency(amt), colLeft + 160, tableY, {
          width: 80,
          align: 'right',
        });
      tableY += 14;
    }
    const earningsEndY = tableY;

    // Deductions column
    tableY = doc.y;
    let deductionsTotal = 0;
    for (const comp of deductions) {
      const amt = valueMap.get(comp.code) ?? 0;
      deductionsTotal += amt;
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(comp.name, colRight, tableY, { width: 150 });
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(this.formatCurrency(amt), colRight + 160, tableY, {
          width: 80,
          align: 'right',
        });
      tableY += 14;
    }
    for (const [label, amt] of statDeductions) {
      deductionsTotal += amt;
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(label, colRight, tableY, { width: 150 });
      doc
        .fontSize(8)
        .fillColor('#1e293b')
        .text(this.formatCurrency(amt), colRight + 160, tableY, {
          width: 80,
          align: 'right',
        });
      tableY += 14;
    }
    const deductionsEndY = tableY;

    doc.y = Math.max(earningsEndY, deductionsEndY) + 4;
    divider(doc);
    doc.moveDown(0.3);

    // Totals row
    doc
      .fontSize(9)
      .fillColor('#0a2656')
      .text('Total Earnings', colLeft, doc.y, { width: 150 });
    doc
      .fontSize(9)
      .fillColor('#0a2656')
      .text(this.formatCurrency(earningsTotal), colLeft + 160, doc.y - 11, {
        width: 80,
        align: 'right',
      });
    doc
      .fontSize(9)
      .fillColor('#0a2656')
      .text('Total Deductions', colRight, doc.y - 11);
    doc
      .fontSize(9)
      .fillColor('#0a2656')
      .text(this.formatCurrency(deductionsTotal), colRight + 160, doc.y - 11, {
        width: 80,
        align: 'right',
      });
    doc.moveDown(0.6);

    divider(doc);
    doc.moveDown(0.5);

    // Net Pay
    const gross = valueMap.get('GROSS') ?? earningsTotal;
    const netPay = Number(valueMap.get('NET_PAY') ?? runEmp.netPay ?? 0);

    doc.fontSize(12).fillColor('#0a2656').text('Net Pay', colLeft, doc.y);
    doc
      .fontSize(14)
      .fillColor('#16a34a')
      .text(this.formatCurrency(netPay), colLeft + 100, doc.y - 16, {
        width: 200,
      });
    doc.moveDown(0.5);

    // Employer contributions
    const employerItems: [string, number][] = [];
    if (valueMap.has('PF_ER') && (valueMap.get('PF_ER') ?? 0) > 0)
      employerItems.push(['PF (Employer)', valueMap.get('PF_ER')!]);
    if (valueMap.has('ESI_ER') && (valueMap.get('ESI_ER') ?? 0) > 0)
      employerItems.push(['ESI (Employer)', valueMap.get('ESI_ER')!]);
    if (valueMap.has('LWF_ER') && (valueMap.get('LWF_ER') ?? 0) > 0)
      employerItems.push(['LWF (Employer)', valueMap.get('LWF_ER')!]);

    if (employerItems.length > 0) {
      divider(doc);
      doc.moveDown(0.3);
      sectionTitle(doc, 'Employer Contributions');
      for (const [label, amt] of employerItems) {
        doc
          .fontSize(8)
          .fillColor('#1e293b')
          .text(label, colLeft, doc.y, { width: 200 });
        doc
          .fontSize(8)
          .fillColor('#1e293b')
          .text(this.formatCurrency(amt), colLeft + 200, doc.y - 10, {
            width: 80,
            align: 'right',
          });
        doc.moveDown(0.1);
      }
    }

    doc.moveDown(1);
    doc
      .fontSize(7)
      .fillColor('#94a3b8')
      .text('This is a system-generated payslip.', startX, doc.y, {
        align: 'center',
        width: doc.page.width - 80,
      });

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
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
}
