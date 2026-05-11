import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { ReqUser } from '../access/access-scope.service';

/** Run statuses considered safe to include in compliance reports. */
const REPORTABLE_RUN_STATUSES = ['APPROVED'];

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
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
  ) {}

  /**
   * Returns the set of client ids the caller is allowed to report on.
   * - ADMIN / CRM: unrestricted (returns null sentinel for "no filter").
   * - PAYROLL: only clients with an ACTIVE assignment and no end_date.
   * - Anyone else reaching this controller: empty list (no access).
   */
  private async getAllowedClientIds(user: ReqUser): Promise<string[] | null> {
    if (!user?.id) return [];
    const role = user.roleCode;
    if (role === 'ADMIN' || role === 'CRM') return null;
    if (role !== 'PAYROLL') return [];
    const rows = await this.assignRepo.find({
      where: { payrollUserId: user.id, status: 'ACTIVE', endDate: IsNull() },
      select: ['clientId'],
    });
    return [...new Set(rows.map((r) => r.clientId))];
  }

  /**
   * Validates the requested clientId against the user's allowed scope and
   * returns either a single clientId (when one was requested) or the full
   * list of allowed ids to use as a SQL `IN (...)` filter.
   */
  private async resolveClientScope(
    user: ReqUser,
    requestedClientId?: string,
  ): Promise<{ clientId?: string; clientIds?: string[] }> {
    const allowed = await this.getAllowedClientIds(user);
    if (requestedClientId) {
      if (allowed !== null && !allowed.includes(requestedClientId)) {
        throw new ForbiddenException(
          'You do not have access to the requested client',
        );
      }
      return { clientId: requestedClientId };
    }
    if (allowed === null) return {};
    return { clientIds: allowed };
  }

  /** Apply the resolved client scope onto a query builder using `re.clientId`. */
  private applyClientScope(
    qb: { andWhere: (sql: string, params?: any) => any },
    scope: { clientId?: string; clientIds?: string[] },
  ): void {
    if (scope.clientId) {
      qb.andWhere('re.clientId = :clientId', { clientId: scope.clientId });
      return;
    }
    if (scope.clientIds) {
      if (scope.clientIds.length === 0) {
        // Force empty result when caller has no assigned clients.
        qb.andWhere('1 = 0');
        return;
      }
      qb.andWhere('re.clientId IN (:...scopeClientIds)', {
        scopeClientIds: scope.clientIds,
      });
    }
  }

  // Bank Statement CSV
  async generateBankStatement(
    user: ReqUser,
    runId?: string,
    clientId?: string,
    year?: number,
    month?: number,
  ): Promise<{ csv: string; fileName: string }> {
    const scope = await this.resolveClientScope(user, clientId);

    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .select([
        're.employeeCode',
        're.employeeName',
        're.employeeId',
        're.netPay',
        're.clientId',
        're.runId',
      ])
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId')
      .andWhere('r.status IN (:...reportableStatuses)', {
        reportableStatuses: REPORTABLE_RUN_STATUSES,
      });

    if (runId) {
      qb.andWhere('re.runId = :runId', { runId });
      this.applyClientScope(qb, scope);
    } else {
      this.applyClientScope(qb, scope);
      if (year) qb.andWhere('r.periodYear = :year', { year });
      if (month) qb.andWhere('r.periodMonth = :month', { month });
    }

    const runEmps = await qb.getMany();

    // Get employee bank details, scoped per (clientId, employeeCode) to avoid
    // cross-client collisions when two clients reuse the same employee code.
    const empMap = await this.loadEmployeesScoped(runEmps);

    const header =
      'Employee Code,Employee Name,Bank Name,Account Number,IFSC,Net Pay';
    const rows = runEmps.map((re) => {
      const emp = this.lookupEmp(empMap, re);
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

  /** Load employees keyed by both id and `${clientId}:${employeeCode}`. */
  private async loadEmployeesScoped(
    runEmps: Array<
      Pick<PayrollRunEmployeeEntity, 'employeeCode' | 'clientId' | 'employeeId'>
    >,
  ): Promise<Map<string, EmployeeEntity>> {
    const map = new Map<string, EmployeeEntity>();
    if (runEmps.length === 0) return map;

    const ids = [
      ...new Set(
        runEmps.map((e) => e.employeeId).filter((v): v is string => !!v),
      ),
    ];
    const pairs = [
      ...new Set(
        runEmps
          .filter((e) => !e.employeeId && e.clientId && e.employeeCode)
          .map((e) => `${e.clientId}::${e.employeeCode}`),
      ),
    ];

    const qb = this.empRepo.createQueryBuilder('e');
    const orParts: string[] = [];
    const params: Record<string, unknown> = {};
    if (ids.length) {
      orParts.push('e.id IN (:...empIds)');
      params.empIds = ids;
    }
    if (pairs.length) {
      const tuples = pairs.map((p) => p.split('::'));
      orParts.push(
        '(e.clientId, e.employeeCode) IN (' +
          tuples.map((_, i) => `(:cid_${i}, :code_${i})`).join(', ') +
          ')',
      );
      tuples.forEach(([cid, code], i) => {
        params[`cid_${i}`] = cid;
        params[`code_${i}`] = code;
      });
    }
    if (orParts.length === 0) return map;

    qb.where(orParts.join(' OR '), params);
    const employees = await qb.getMany();
    for (const emp of employees) {
      map.set(emp.id, emp);
      if (emp.clientId && emp.employeeCode) {
        map.set(`${emp.clientId}::${emp.employeeCode}`, emp);
      }
    }
    return map;
  }

  private lookupEmp(
    map: Map<string, EmployeeEntity>,
    re: { employeeId: string | null; clientId: string; employeeCode: string },
  ): EmployeeEntity | undefined {
    if (re.employeeId && map.has(re.employeeId)) return map.get(re.employeeId);
    return map.get(`${re.clientId}::${re.employeeCode}`);
  }

  // Muster Roll CSV
  async generateMusterRoll(
    user: ReqUser,
    clientId?: string,
    year?: number,
    month?: number,
  ): Promise<{ csv: string; fileName: string }> {
    const scope = await this.resolveClientScope(user, clientId);

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
        're.otHours',
        'r.periodYear',
        'r.periodMonth',
        'r.status',
      ])
      .andWhere('r.status IN (:...reportableStatuses)', {
        reportableStatuses: REPORTABLE_RUN_STATUSES,
      });

    this.applyClientScope(qb, scope);
    if (year) qb.andWhere('r.periodYear = :year', { year });
    if (month) qb.andWhere('r.periodMonth = :month', { month });

    const raws = await qb.getRawMany();

    const header =
      'S.No,Employee Code,Employee Name,Designation,Period,Days Present,Days Absent,Overtime Hours,Gross Pay,Net Pay';
    const rows = raws.map((r, i) => {
      const period = `${r.r_period_year}-${String(r.r_period_month).padStart(2, '0')}`;
      const daysPresent = Number(r.re_days_present) || 0;
      const daysAbsent = Number(r.re_lop_days) || 0;
      const overtimeHours = Number(r.re_ot_hours) || 0;
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

  // Cost Analysis CSV
  async generateCostAnalysis(
    user: ReqUser,
    clientId?: string,
    year?: number,
  ): Promise<{ csv: string; fileName: string }> {
    const scope = await this.resolveClientScope(user, clientId);
    const pfEmployerExpr = this.componentAmountSql('re', [
      'PF_ER',
      'PF_EMPLOYER',
      'EMPLOYER_PF',
      'EPF_EMPLOYER',
    ]);
    const esiEmployerExpr = this.componentAmountSql('re', [
      'ESI_ER',
      'ESI_EMPLOYER',
      'EMPLOYER_ESI',
    ]);
    const incentiveExpr = this.componentAmountSql('re', [
      'INCENTIVE',
      'INCENTIVES',
      'PERFORMANCE_INCENTIVE',
      'INCENTIVE_PAY',
    ]);
    const bonusExpr = this.componentAmountSql('re', [
      'BONUS',
      'ATT_BONUS',
      'ARREAR_ATT_BONUS',
      'STATUTORY_BONUS',
      'EMPLOYER_BONUS',
      'BONUS_PROVISION',
    ]);

    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId')
      .select([
        're.clientId',
        'r.periodYear',
        'r.periodMonth',
        'SUM(CAST(re.grossEarnings AS DECIMAL(14,2))) AS total_gross',
        'SUM(CAST(re.totalDeductions AS DECIMAL(14,2))) AS total_deductions',
        `SUM(COALESCE(CAST(re.pfEmployer AS DECIMAL(14,2)), ${pfEmployerExpr})) AS total_pf_employer`,
        `SUM(COALESCE(CAST(re.esiEmployer AS DECIMAL(14,2)), ${esiEmployerExpr})) AS total_esi_employer`,
        `SUM(${incentiveExpr}) AS total_incentive`,
        `SUM(COALESCE(CAST(re.bonus AS DECIMAL(14,2)), ${bonusExpr})) AS total_bonus`,
        'SUM(CAST(re.netPay AS DECIMAL(14,2))) AS total_net_pay',
        'COUNT(re.id) AS head_count',
      ])
      .where('r.status IN (:...reportableStatuses)', {
        reportableStatuses: REPORTABLE_RUN_STATUSES,
      })
      .groupBy('re.clientId, r.periodYear, r.periodMonth')
      .orderBy('r.periodYear', 'ASC')
      .addOrderBy('r.periodMonth', 'ASC');

    this.applyClientScope(qb, scope);
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
      'Client,Period,Head Count,Gross Earnings,Total Deductions,Employer PF,Employer ESI,Incentive,Bonus,Employer Additions,Net Pay,CTC (Gross + PF + ESI + Incentive + Bonus)';
    const rows = raws.map((r) => {
      const period = `${r.r_period_year}-${String(r.r_period_month).padStart(2, '0')}`;
      const gross = Number(r.total_gross || 0);
      const pfEmployer = Number(r.total_pf_employer || 0);
      const esiEmployer = Number(r.total_esi_employer || 0);
      const incentive = Number(r.total_incentive || 0);
      const bonus = Number(r.total_bonus || 0);
      const employerAdditions = pfEmployer + esiEmployer + incentive + bonus;
      return [
        `"${clientMap.get(r.re_client_id) || r.re_client_id}"`,
        period,
        r.head_count,
        gross.toFixed(2),
        Number(r.total_deductions || 0).toFixed(2),
        pfEmployer.toFixed(2),
        esiEmployer.toFixed(2),
        incentive.toFixed(2),
        bonus.toFixed(2),
        employerAdditions.toFixed(2),
        Number(r.total_net_pay || 0).toFixed(2),
        (gross + employerAdditions).toFixed(2),
      ].join(',');
    });

    return {
      csv: [header, ...rows].join('\n'),
      fileName: `cost_analysis_${year || 'all'}.csv`,
    };
  }

  // Form 16 / TDS Summary CSV
  private componentAmountSql(
    runEmployeeAlias: string,
    componentCodes: string[],
  ): string {
    const normalizedCodes = componentCodes
      .map((code) => code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean)
      .map((code) => `'${code.replace(/'/g, "''")}'`)
      .join(', ');
    const normalizedComponentExpr =
      "regexp_replace(upper(cv.component_code), '[^A-Z0-9]', '', 'g')";

    return `COALESCE((
      SELECT SUM(CAST(cv.amount AS DECIMAL(14,2)))
      FROM payroll_run_component_values cv
      WHERE cv.run_employee_id = ${runEmployeeAlias}.id
        AND ${normalizedComponentExpr} IN (${normalizedCodes})
    ), 0)`;
  }

  async generateForm16Summary(
    user: ReqUser,
    clientId?: string,
    financialYear?: string,
  ): Promise<{ csv: string; fileName: string }> {
    const scope = await this.resolveClientScope(user, clientId);
    // Financial year: e.g., "2025-26" means April 2025 to March 2026
    let startYear = new Date().getFullYear() - 1;
    let endYear = startYear + 1;

    if (financialYear) {
      const parts = financialYear.split('-');
      startYear = parseInt(parts[0], 10);
      endYear = parts.length > 1 ? startYear + 1 : startYear + 1;
    }

    // Get all run employees for the financial year (Apr startYear to Mar endYear).
    // Use the engine's stored TDS component value (code 'TDS') instead of a fake
    // 5%-above-2.5L formula.
    const tdsExpr = this.componentAmountSql('re', ['TDS']);
    const qb = this.runEmpRepo
      .createQueryBuilder('re')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.runId')
      .select([
        're.employeeCode',
        're.employeeName',
        're.clientId',
        'MAX(re.employeeId) AS employee_id',
        'SUM(CAST(re.grossEarnings AS DECIMAL(14,2))) AS annual_gross',
        'SUM(CAST(re.totalDeductions AS DECIMAL(14,2))) AS annual_deductions',
        'SUM(CAST(re.netPay AS DECIMAL(14,2))) AS annual_net',
        `SUM(${tdsExpr}) AS annual_tds`,
      ])
      .where(
        '((r.periodYear = :startYear AND r.periodMonth >= 4) OR (r.periodYear = :endYear AND r.periodMonth <= 3))',
        { startYear, endYear },
      )
      .andWhere('r.status IN (:...reportableStatuses)', {
        reportableStatuses: REPORTABLE_RUN_STATUSES,
      })
      .groupBy('re.employeeCode, re.employeeName, re.clientId');

    this.applyClientScope(qb, scope);

    const raws = await qb.getRawMany();

    // Look up employee PAN per (clientId, employeeCode) so we don't pull the
    // wrong PAN when two clients reuse the same employee code.
    const empMap = await this.loadEmployeesScoped(
      raws.map((r) => ({
        employeeId: r.employee_id ?? null,
        clientId: r.re_client_id,
        employeeCode: r.re_employee_code,
      })),
    );

    const fyLabel = `${startYear}-${String(endYear).slice(-2)}`;
    const header =
      'S.No,Employee Code,Employee Name,PAN,Annual Gross,Annual Deductions,Annual Net Pay,Annual TDS';
    const rows = raws.map((r, i) => {
      const emp = this.lookupEmp(empMap, {
        employeeId: r.employee_id ?? null,
        clientId: r.re_client_id,
        employeeCode: r.re_employee_code,
      });
      const annualGross = Number(r.annual_gross || 0);
      const annualTds = Number(r.annual_tds || 0);
      return [
        i + 1,
        r.re_employee_code,
        `"${r.re_employee_name}"`,
        emp?.pan || '',
        annualGross.toFixed(2),
        Number(r.annual_deductions || 0).toFixed(2),
        Number(r.annual_net || 0).toFixed(2),
        annualTds.toFixed(2),
      ].join(',');
    });

    return {
      csv: [header, ...rows].join('\n'),
      fileName: `form16_tds_summary_FY_${fyLabel}.csv`,
    };
  }
}
