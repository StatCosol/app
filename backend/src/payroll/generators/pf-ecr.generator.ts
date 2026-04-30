import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { RegistersRecordEntity } from '../entities/registers-record.entity';

/**
 * PF ECR (Electronic Challan cum Return) Generator
 *
 * Reads pre-computed component values (PF_WAGES, PF_EMP, PF_ER, PF_EPS, PF_DIFF)
 * from the processed payroll run and formats them into the ECR text file.
 *
 * ECR text file format (#~# delimited):
 * UAN | Member Name | Gross Wages | EPF Wages | EPS Wages | EDLI Wages |
 * EPF Contribution (EE) | EPS Contribution (ER) | Diff EPF+EPS (ER) |
 * NCP Days | Refund of Advances
 */
@Injectable()
export class PfEcrGenerator {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(PayrollClientSetupEntity)
    private readonly setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(RegistersRecordEntity)
    private readonly rrRepo: Repository<RegistersRecordEntity>,
  ) {}

  async generate(
    runId: string,
    userId?: string,
  ): Promise<{ fileName: string; content: string }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const setup = await this.setupRepo.findOne({
      where: { clientId: run.clientId },
    });
    const pfCeiling = setup ? Number(setup.pfWageCeiling) || 15000 : 15000;

    const employees = await this.runEmpRepo.find({
      where: { runId },
      order: { employeeName: 'ASC' },
    });

    const lines: string[] = [];

    for (const emp of employees) {
      if (!emp.uan) continue; // Skip employees without UAN

      const values = await this.compValRepo.find({
        where: { runEmployeeId: emp.id },
      });
      const valMap = new Map<string, number>();
      values.forEach((v) => valMap.set(v.componentCode, Number(v.amount)));

      const grossWage = this.num(valMap.get('GROSS') ?? emp.grossEarnings ?? 0);
      const pfWages = this.num(valMap.get('PF_WAGES') ?? 0);
      const pfEmp = this.num(valMap.get('PF_EMP') ?? 0);
      const pfEps = this.num(valMap.get('PF_EPS') ?? 0);
      const pfDiff = this.num(valMap.get('PF_DIFF') ?? 0);

      // ECR fields derived from stored values
      const epfWages = Math.min(pfWages, pfCeiling);
      // EPS wages: use stored EPS_WAGES (0 when employee is EPS-excluded)
      const epsWages = valMap.has('EPS_WAGES')
        ? this.num(valMap.get('EPS_WAGES'))
        : Math.min(pfWages, 15000);
      const edliWages = epfWages;

      const ncpDays = this.num(valMap.get('NCP_DAYS') ?? 0);

      const row = [
        emp.uan,
        emp.employeeName,
        grossWage,
        epfWages,
        epsWages,
        edliWages,
        pfEmp,
        pfEps,
        pfDiff,
        ncpDays,
        0, // Refund of Advances
      ].join('#~#');

      lines.push(row);
    }

    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const fileName = `ECR_${period}_${run.clientId.substring(0, 8)}.txt`;
    const content = lines.join('\n');

    await this.saveLinkage(run, fileName, content, userId);

    return { fileName, content };
  }

  private async saveLinkage(
    run: PayrollRunEntity,
    fileName: string,
    content: string,
    userId?: string,
  ): Promise<void> {
    const dir = path.join(process.cwd(), 'uploads', 'pf-ecr');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}_${fileName}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    const stats = fs.statSync(filePath);
    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const record = this.rrRepo.create({
      clientId: run.clientId,
      branchId: run.branchId ?? null,
      category: 'RECORD',
      title: `PF ECR - ${period}`,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      preparedByUserId: userId || '00000000-0000-0000-0000-000000000000',
      fileName,
      filePath,
      fileType: 'text/plain',
      fileSize: String(stats.size),
      registerType: 'ECR',
      stateCode: null,
      approvalStatus: 'PENDING',
    });
    await this.rrRepo.save(record);
  }

  private num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
}
