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
 * PF ECR (Electronic Challan cum Return) Generator
 *
 * Reads pre-computed component values (PF_WAGES, PF_EMP, PF_ER, PF_EPS, PF_DIFF)
 * from the processed payroll run and formats them into the ECR text file.
 *
 * Branch-wise generation:
 *   When the client has any branch with a `pf_code` configured on
 *   `client_branches`, one ECR file is produced per such branch (employees
 *   are grouped by `payroll_run_employees.branch_id`). Branches without a
 *   `pf_code` fall through to a single consolidated file using the
 *   client-level establishment code.
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
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  /**
   * Generate one or more ECR files for the run.
   * - If any branch in the run has `pf_code` set → one file per such branch
   *   (plus one consolidated file for remaining un-coded employees, if any).
   * - Otherwise → single consolidated file (legacy behaviour).
   */
  async generate(
    runId: string,
    userId?: string,
  ): Promise<{ fileName: string; content: string }[]> {
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
    const hasBranchPfCodes = Array.from(branchMap.values()).some(
      (b) => b.pfCode && b.pfCode.trim().length > 0,
    );

    const results: { fileName: string; content: string }[] = [];

    if (!hasBranchPfCodes) {
      results.push(
        await this.buildAndSave(run, employees, pfCeiling, null, userId),
      );
      return results;
    }

    // Group by branch when branch-wise codes are configured.
    const grouped = new Map<string | null, PayrollRunEmployeeEntity[]>();
    for (const emp of employees) {
      const key =
        emp.branchId && branchMap.get(emp.branchId)?.pfCode
          ? emp.branchId
          : null;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(emp);
    }

    for (const [bid, emps] of grouped) {
      const branch = bid ? (branchMap.get(bid) ?? null) : null;
      results.push(
        await this.buildAndSave(run, emps, pfCeiling, branch, userId),
      );
    }
    return results;
  }

  private async buildAndSave(
    run: PayrollRunEntity,
    employees: PayrollRunEmployeeEntity[],
    pfCeiling: number,
    branch: BranchEntity | null,
    userId?: string,
  ): Promise<{ fileName: string; content: string }> {
    const lines: string[] = [];

    for (const emp of employees) {
      if (!emp.uan) continue;

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

      const epfWages = Math.min(pfWages, pfCeiling);
      const epsWages = valMap.has('EPS_WAGES')
        ? this.num(valMap.get('EPS_WAGES'))
        : Math.min(pfWages, 15000);
      const edliWages = epfWages;

      const ncpDays = this.num(valMap.get('NCP_DAYS') ?? 0);

      lines.push(
        [
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
          0,
        ].join('#~#'),
      );
    }

    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const branchSuffix = branch
      ? `_${this.sanitize(branch.branchCode || branch.id.substring(0, 8))}`
      : '';
    const fileName = `ECR_${period}_${run.clientId.substring(0, 8)}${branchSuffix}.txt`;
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
    const dir = path.join(process.cwd(), 'uploads', 'pf-ecr');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}_${fileName}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    const stats = fs.statSync(filePath);
    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const titleSuffix = branch
      ? ` - ${branch.branchName || branch.branchCode || 'Branch'}${branch.pfCode ? ` [${branch.pfCode}]` : ''}`
      : '';
    const record = this.rrRepo.create({
      clientId: run.clientId,
      branchId: branch ? branch.id : (run.branchId ?? null),
      category: 'RECORD',
      title: `PF ECR - ${period}${titleSuffix}`,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      preparedByUserId: userId || '00000000-0000-0000-0000-000000000000',
      fileName,
      filePath,
      fileType: 'text/plain',
      fileSize: String(stats.size),
      registerType: 'ECR',
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
