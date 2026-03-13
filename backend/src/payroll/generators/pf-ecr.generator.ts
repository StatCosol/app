import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';

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
  ) {}

  async generate(
    runId: string,
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
      const epsWages = Math.min(pfWages, 15000); // EPS statutory ceiling always 15000
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

    return { fileName, content: lines.join('\n') };
  }

  private num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
}
