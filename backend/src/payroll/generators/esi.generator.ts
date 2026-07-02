import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { RegistersRecordEntity } from '../entities/registers-record.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';

/**
 * ESI (Employee State Insurance) file generator
 *
 * Reads pre-computed component values (ESI_WAGES, ESI_EMP, ESI_ER)
 * from the processed payroll run and formats them into the ESI contribution file.
 *
 * Branch-wise generation:
 *   When the client has any branch with `esi_code` configured on
 *   `client_branches`, one ESI contribution file is produced per such branch
 *   (employees grouped by `payroll_run_employees.branch_id`). Branches
 *   without `esi_code` produce a consolidated file under the client-level code.
 *
 * ESI contribution file format (pipe-delimited):
 * IP Number | IP Name | No of Days | Total Wages |
 * IP Contribution | Employer Contribution | Total Contribution
 */
@Injectable()
export class EsiGenerator {
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
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  async generate(
    runId: string,
    userId?: string,
  ): Promise<{ fileName: string; content: string }[]> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const setup = await this.setupRepo.findOne({
      where: { clientId: run.clientId },
    });
    const esiCeiling = setup ? Number(setup.esiWageCeiling) || 21000 : 21000;

    const employees = await this.runEmpRepo.find({
      where: { runId },
      order: { employeeName: 'ASC' },
    });

    const branchIds = Array.from(
      new Set(employees.map((e) => e.branchId).filter((b): b is string => !!b)),
    );
    const branchMap = new Map<string, BranchEntity>();
    if (branchIds.length) {
      const branches = await this.branchRepo.find({
        where: { id: In(branchIds) },
      });
      branches.forEach((b) => branchMap.set(b.id, b));
    }
    const hasBranchEsiCodes = Array.from(branchMap.values()).some(
      (b) => b.esiCode && b.esiCode.trim().length > 0,
    );

    const results: { fileName: string; content: string }[] = [];

    if (!hasBranchEsiCodes) {
      results.push(
        await this.buildAndSave(run, employees, esiCeiling, null, userId),
      );
      return results;
    }

    const grouped = new Map<string | null, PayrollRunEmployeeEntity[]>();
    for (const emp of employees) {
      const key =
        emp.branchId && branchMap.get(emp.branchId)?.esiCode
          ? emp.branchId
          : null;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(emp);
    }

    for (const [bid, emps] of grouped) {
      const branch = bid ? (branchMap.get(bid) ?? null) : null;
      results.push(
        await this.buildAndSave(run, emps, esiCeiling, branch, userId),
      );
    }
    return results;
  }

  private async buildAndSave(
    run: PayrollRunEntity,
    employees: PayrollRunEmployeeEntity[],
    esiCeiling: number,
    branch: BranchEntity | null,
    userId?: string,
  ): Promise<{ fileName: string; content: string }> {
    const lines: string[] = [];

    for (const emp of employees) {
      if (!emp.esic) continue;

      const values = await this.compValRepo.find({
        where: { runEmployeeId: emp.id },
      });
      const valMap = new Map<string, number>();
      values.forEach((v) => valMap.set(v.componentCode, Number(v.amount)));

      const esiWages = this.num(
        valMap.get('ESI_WAGES') ?? valMap.get('GROSS') ?? 0,
      );
      if (esiWages > esiCeiling) continue;

      const esiEmp = this.num(valMap.get('ESI_EMP') ?? 0);
      const esiEr = this.num(valMap.get('ESI_ER') ?? 0);
      const totalContrib = esiEmp + esiEr;

      const ncpDays = this.num(valMap.get('NCP_DAYS') ?? 0);
      const daysInMonth = new Date(
        run.periodYear,
        run.periodMonth,
        0,
      ).getDate();
      const workingDays = daysInMonth - ncpDays;

      lines.push(
        [
          emp.esic,
          emp.employeeName,
          workingDays,
          esiWages,
          esiEmp,
          esiEr,
          totalContrib,
        ].join('|'),
      );
    }

    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const branchSuffix = branch
      ? `_${this.sanitize(branch.branchCode || branch.id.substring(0, 8))}`
      : '';
    const fileName = `ESI_${period}_${run.clientId.substring(0, 8)}${branchSuffix}.txt`;
    const content = lines.join('\n');

    await this.saveLinkage(run, fileName, content, branch, userId);
    return { fileName, content };
  }

  private async saveLinkage(
    run: PayrollRunEntity,
    fileName: string,
    content: string,
    branch: BranchEntity | null,
    userId?: string,
  ): Promise<void> {
    const dir = path.join(process.cwd(), 'uploads', 'esi');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}_${fileName}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    const stats = fs.statSync(filePath);
    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const titleSuffix = branch
      ? ` - ${branch.branchName || branch.branchCode || 'Branch'}${branch.esiCode ? ` [${branch.esiCode}]` : ''}`
      : '';
    const record = this.rrRepo.create({
      clientId: run.clientId,
      branchId: branch ? branch.id : (run.branchId ?? null),
      category: 'RECORD',
      title: `ESI Contribution - ${period}${titleSuffix}`,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      preparedByUserId: userId || '00000000-0000-0000-0000-000000000000',
      fileName,
      filePath,
      fileType: 'text/plain',
      fileSize: String(stats.size),
      registerType: 'ESI',
      stateCode: branch?.stateCode ?? null,
      approvalStatus: 'PENDING',
    });
    await this.rrRepo.save(record);
  }

  private sanitize(s: string): string {
    return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 30);
  }

  private num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
}
