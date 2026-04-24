import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class PayrollReportsService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly _runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly _compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(PayrollFnfEntity)
    private readonly _fnfRepo: Repository<PayrollFnfEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
  ) {}

  // ── Bank Statement CSV ─────────────────────────────────
  async generateBankStatement(
    _user: ReqUser,
    runId?: string,
    clientId?: string,
    year?: number,
    month?: number,
  ): Promise<{ csv: string; fileName: string }> {
    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .select([
        're.employeeCode',
        're.employeeName',
        're.netPay',
        're.clientId',
        're.runId',
      ])
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId');

    if (runId) {
      qb.andWhere('re.runId = :runId', { runId });
    } else {
      if (clientId) qb.andWhere('re.clientId = :clientId', { clientId });
      if (year) qb.andWhere('r.periodYear = :year', { year });
      if (month) qb.andWhere('r.periodMonth = :month', { month });
    }

    const runEmps = await qb.getMany();

    // Get employee bank details
    const empCodes = [...new Set(runEmps.map((e) => e.employeeCode))];
    const employees = empCodes.length
      ? await this.empRepo
          .createQueryBuilder('e')
          .where('e.employeeCode IN (:...codes)', { codes: empCodes })
          .getMany()
      : [];

    const empMap = new Map(employees.map((e) => [e.employeeCode, e]));

    const header =
      'Employee Code,Employee Name,Bank Name,Account Number,IFSC,Net Pay';
    const rows = runEmps.map((re) => {
      const emp = empMap.get(re.employeeCode);
      return [
        re.employeeCode,
        `"${re.employeeName}"`,
        `"${emp?.bankName || ''}"`,
        emp?.bankAccount || '',
        emp?.ifsc || '',
        re.netPay,
      ].join(',');
    });

    const periodLabel =
      year && month ? `${year}-${String(month).padStart(2, '0')}` : 'all';
    return {
      csv: [header, ...rows].join('\n'),
      fileName: `bank_statement_${periodLabel}.csv`,
    };
  }

  // ── Muster Roll CSV ────────────────────────────────────
  async generateMusterRoll(
    _user: ReqUser,
    clientId?: string,
    year?: number,
    month?: number,
  ): Promise<{ csv: string; fileName: string }> {
    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId')
      .select([
        're.employeeCode',
        're.employeeName',
        're.designation',
        're.grossEarnings',
        're.netPay',
        're.totalDays',
        're.daysPresent',
        're.lopDays',
        'r.periodYear',
        'r.periodMonth',
        'r.status',
      ]);

    if (clientId) qb.andWhere('re.clientId = :clientId', { clientId });
    if (year) qb.andWhere('r.periodYear = :year', { year });
    if (month) qb.andWhere('r.periodMonth = :month', { month });

    const raws = await qb.getRawMany();

    const header =
      'S.No,Employee Code,Employee Name,Designation,Period,Days Present,Days Absent,Overtime Hours,Gross Pay,Net Pay';
    const rows = raws.map((r, i) => {
      const period = `${r.r_period_year}-${String(r.r_period_month).padStart(2, '0')}`;
      const daysPresent = Number(r.re_days_present) || 0;
      const daysAbsent = Number(r.re_lop_days) || 0;
      const overtimeHours = 0;
      return [
        i + 1,
        r.re_employee_code,
        `"${r.re_employee_name}"`,
        `"${r.re_designation || ''}"`,
        period,
        daysPresent,
        daysAbsent,
        overtimeHours,
        r.re_gross_earnings || 0,
        r.re_net_pay || 0,
      ].join(',');
    });

    const periodLabel =
      year && month ? `${year}-${String(month).padStart(2, '0')}` : 'all';
    return {
      csv: [header, ...rows].join('\n'),
      fileName: `muster_roll_${periodLabel}.csv`,
    };
  }

  // ── Cost Analysis CSV ──────────────────────────────────
  async generateCostAnalysis(
    _user: ReqUser,
    clientId?: string,
    year?: number,
  ): Promise<{ csv: string; fileName: string }> {
    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId')
      .select([
        're.clientId',
        'r.periodYear',
        'r.periodMonth',
        'SUM(CAST(re.grossEarnings AS DECIMAL(14,2))) AS total_gross',
        'SUM(CAST(re.totalDeductions AS DECIMAL(14,2))) AS total_deductions',
        'SUM(CAST(re.employerCost AS DECIMAL(14,2))) AS total_employer_cost',
        'SUM(CAST(re.netPay AS DECIMAL(14,2))) AS total_net_pay',
        'COUNT(re.id) AS head_count',
      ])
      .groupBy('re.clientId, r.periodYear, r.periodMonth')
      .orderBy('r.periodYear', 'ASC')
      .addOrderBy('r.periodMonth', 'ASC');

    if (clientId) qb.andWhere('re.clientId = :clientId', { clientId });
    if (year) qb.andWhere('r.periodYear = :year', { year });

    const raws = await qb.getRawMany();

    // Enrich with client names
    const clientIds = [...new Set(raws.map((r) => r.re_client_id))];
    const clients = clientIds.length
      ? await this.clientRepo
          .createQueryBuilder('c')
          .where('c.id IN (:...ids)', { ids: clientIds })
          .select(['c.id', 'c.clientName'])
          .getMany()
      : [];
    const clientMap = new Map(clients.map((c) => [c.id, c.clientName]));

    const header =
      'Client,Period,Head Count,Gross Earnings,Total Deductions,Employer Cost,Net Pay,CTC (Gross + Employer)';
    const rows = raws.map((r) => {
      const period = `${r.r_period_year}-${String(r.r_period_month).padStart(2, '0')}`;
      const gross = Number(r.total_gross || 0);
      const empCost = Number(r.total_employer_cost || 0);
      return [
        `"${clientMap.get(r.re_client_id) || r.re_client_id}"`,
        period,
        r.head_count,
        gross.toFixed(2),
        Number(r.total_deductions || 0).toFixed(2),
        empCost.toFixed(2),
        Number(r.total_net_pay || 0).toFixed(2),
        (gross + empCost).toFixed(2),
      ].join(',');
    });

    return {
      csv: [header, ...rows].join('\n'),
      fileName: `cost_analysis_${year || 'all'}.csv`,
    };
  }

  // ── Form 16 / TDS Summary CSV ──────────────────────────
  async generateForm16Summary(
    _user: ReqUser,
    clientId?: string,
    financialYear?: string,
  ): Promise<{ csv: string; fileName: string }> {
    // Financial year: e.g., "2025-26" → April 2025 to March 2026
    let startYear = new Date().getFullYear() - 1;
    let endYear = startYear + 1;

    if (financialYear) {
      const parts = financialYear.split('-');
      startYear = parseInt(parts[0], 10);
      endYear = parts.length > 1 ? startYear + 1 : startYear + 1;
    }

    // Get all run employees for the financial year (Apr startYear to Mar endYear)
    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId')
      .select([
        're.employeeCode',
        're.employeeName',
        're.clientId',
        'SUM(CAST(re.grossEarnings AS DECIMAL(14,2))) AS annual_gross',
        'SUM(CAST(re.totalDeductions AS DECIMAL(14,2))) AS annual_deductions',
        'SUM(CAST(re.netPay AS DECIMAL(14,2))) AS annual_net',
      ])
      .where(
        '((r.periodYear = :startYear AND r.periodMonth >= 4) OR (r.periodYear = :endYear AND r.periodMonth <= 3))',
        { startYear, endYear },
      )
      .groupBy('re.employeeCode, re.employeeName, re.clientId');

    if (clientId) qb.andWhere('re.clientId = :clientId', { clientId });

    const raws = await qb.getRawMany();

    // Get employee PAN details
    const empCodes = [...new Set(raws.map((r) => r.re_employee_code))];
    const employees = empCodes.length
      ? await this.empRepo
          .createQueryBuilder('e')
          .where('e.employeeCode IN (:...codes)', { codes: empCodes })
          .getMany()
      : [];
    const empMap = new Map(employees.map((e) => [e.employeeCode, e]));

    const fyLabel = `${startYear}-${String(endYear).slice(-2)}`;
    const header =
      'S.No,Employee Code,Employee Name,PAN,Annual Gross,Annual Deductions,Annual Net Pay,Estimated TDS';
    const rows = raws.map((r, i) => {
      const emp = empMap.get(r.re_employee_code);
      const annualGross = Number(r.annual_gross || 0);
      // Simplified TDS estimation (actual would use tax slabs)
      const estimatedTds =
        annualGross > 500000 ? (annualGross - 250000) * 0.05 : 0;
      return [
        i + 1,
        r.re_employee_code,
        `"${r.re_employee_name}"`,
        emp?.pan || '',
        annualGross.toFixed(2),
        Number(r.annual_deductions || 0).toFixed(2),
        Number(r.annual_net || 0).toFixed(2),
        estimatedTds.toFixed(2),
      ].join(',');
    });

    return {
      csv: [header, ...rows].join('\n'),
      fileName: `form16_tds_summary_FY_${fyLabel}.csv`,
    };
  }
}
