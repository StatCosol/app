import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';

/**
 * ESI (Employee State Insurance) file generator
 *
 * Reads pre-computed component values (ESI_WAGES, ESI_EMP, ESI_ER)
 * from the processed payroll run and formats them into the ESI contribution file.
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
  ) {}

  async generate(
    runId: string,
  ): Promise<{ fileName: string; content: string }> {
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

    const lines: string[] = [];

    for (const emp of employees) {
      if (!emp.esic) continue; // Skip employees without ESIC number

      const values = await this.compValRepo.find({
        where: { runEmployeeId: emp.id },
      });
      const valMap = new Map<string, number>();
      values.forEach((v) => valMap.set(v.componentCode, Number(v.amount)));

      const esiWages = this.num(
        valMap.get('ESI_WAGES') ?? valMap.get('GROSS') ?? 0,
      );

      // Only generate for employees within ESI wage ceiling
      if (esiWages > esiCeiling) continue;

      const esiEmp = this.num(valMap.get('ESI_EMP') ?? 0);
      const esiEr = this.num(valMap.get('ESI_ER') ?? 0);
      const totalContrib = esiEmp + esiEr;

      // Working days: days in period month minus NCP_DAYS
      const ncpDays = this.num(valMap.get('NCP_DAYS') ?? 0);
      const daysInMonth = new Date(
        run.periodYear,
        run.periodMonth,
        0,
      ).getDate();
      const workingDays = daysInMonth - ncpDays;

      const row = [
        emp.esic,
        emp.employeeName,
        workingDays,
        esiWages,
        esiEmp,
        esiEr,
        totalContrib,
      ].join('|');

      lines.push(row);
    }

    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const fileName = `ESI_${period}_${run.clientId.substring(0, 8)}.txt`;

    return { fileName, content: lines.join('\n') };
  }

  private num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
}
