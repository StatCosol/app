import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunItemEntity } from './entities/payroll-run-item.entity';
import { ReqUser } from '../access/access-scope.service';

export interface BranchRow {
  branch_id: string;
  branch_name: string;
  total_employees: string;
  gross_total: string;
  pf_employee: string;
  pf_employer: string;
  esi_employee: string;
  esi_employer: string;
  pt_total: string;
  bonus_total: string;
  other_employer_cost: string;
  employer_cost_total: string;
  net_pay_total: string;
  monthly_ctc: string;
}

@Injectable()
export class CtcSummaryService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly _empRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunItemEntity)
    private readonly _itemRepo: Repository<PayrollRunItemEntity>,
  ) {}

  /* ─── Client CTC Summary (consolidated + branch-wise) ────── */
  async getClientCtcSummary(user: ReqUser, year: number, month?: number) {
    const clientId = this.requireClientId(user);
    if (!year) throw new BadRequestException('year is required');

    // Get finalized run IDs for this client/period
    const runFilter = this.buildRunFilter(clientId, year, month);

    // Branch-wise aggregation
    const branches = await this.queryBranchWise(
      runFilter.where,
      runFilter.params,
    );

    // Consolidate
    const consolidated = this.consolidate(branches);

    return { year, month: month || null, consolidated, branches };
  }

  async getClientYtd(user: ReqUser, year: number) {
    const clientId = this.requireClientId(user);
    if (!year) throw new BadRequestException('year is required');

    const filter = this.buildRunFilter(clientId, year);
    const rows = await this.queryBranchWise(filter.where, filter.params);
    return this.consolidate(rows);
  }

  async getClientMonthlyTrend(user: ReqUser, year: number) {
    const clientId = this.requireClientId(user);
    if (!year) throw new BadRequestException('year is required');

    return this.queryMonthlyTrend(clientId, year);
  }

  /* ─── Branch CTC Summary ─────────────────────────────────── */
  async getBranchCtcSummary(user: ReqUser, year: number, month?: number) {
    const { clientId, branchId } = this.requireBranchScope(user);
    if (!year) throw new BadRequestException('year is required');

    const filter = this.buildRunFilter(clientId, year, month, branchId);
    const rows = await this.queryBranchWise(filter.where, filter.params);
    const summary = this.consolidate(rows);

    return { year, month: month || null, summary };
  }

  async getBranchYtd(user: ReqUser, year: number) {
    const { clientId, branchId } = this.requireBranchScope(user);
    if (!year) throw new BadRequestException('year is required');

    const filter = this.buildRunFilter(clientId, year, undefined, branchId);
    const rows = await this.queryBranchWise(filter.where, filter.params);
    return this.consolidate(rows);
  }

  async getBranchMonthlyTrend(user: ReqUser, year: number) {
    const { clientId, branchId } = this.requireBranchScope(user);
    if (!year) throw new BadRequestException('year is required');

    return this.queryMonthlyTrend(clientId, year, branchId);
  }

  /* ─── Private helpers ────────────────────────────────────── */

  private requireClientId(user: ReqUser): string {
    if (user.roleCode !== 'CLIENT')
      throw new ForbiddenException('Client role required');
    if (!user.clientId) throw new BadRequestException('No clientId on token');
    return user.clientId;
  }

  private requireBranchScope(user: ReqUser) {
    if (user.roleCode !== 'CLIENT')
      throw new ForbiddenException('Client role required');
    if (!user.clientId || !user.branchIds?.length)
      throw new BadRequestException('Branch scope missing');
    return { clientId: user.clientId, branchId: user.branchIds[0] };
  }

  private buildRunFilter(
    clientId: string,
    year: number,
    month?: number,
    branchId?: string,
  ) {
    let where = `r.client_id = :clientId AND r.period_year = :year AND r.status IN ('APPROVED','COMPLETED','SUBMITTED')`;
    const params: Record<string, any> = { clientId, year };

    if (month) {
      where += ' AND r.period_month = :month';
      params.month = month;
    }
    if (branchId) {
      // Branch CTC must be strictly scoped to the branch.
      // Including NULL run.branch_id pulls unassigned data into branch totals.
      where += ' AND r.branch_id = :branchId';
      params.branchId = branchId;
    }
    return { where, params };
  }

  /**
   * Core query: aggregate CTC components by branch from finalized runs.
   * Uses payroll_run_employees for gross/net/employer_cost totals,
   * and payroll_run_items for component-level breakdowns (PF, ESI, PT, etc.).
   */
  private async queryBranchWise(
    runWhere: string,
    params: Record<string, any>,
  ): Promise<BranchRow[]> {
    // Individual components: read directly from payroll_run_employees columns (populated on upload).
    // Falls back to payroll_run_component_values / payroll_run_items for runs processed via engine.
    const pfEmployeeExpr = `COALESCE(e.pf_employee::numeric,  ${this.sumRunComponentAmountByCodesSql('e', ['PF', 'PF_EMP', 'PF_EMPLOYEE', 'PF_EE', 'EPF_EMPLOYEE'])})`;
    const esiEmployeeExpr = `COALESCE(e.esi_employee::numeric, ${this.sumRunComponentAmountByCodesSql('e', ['ESI', 'ESI_EMP', 'ESI_EMPLOYEE', 'ESI_EE'])})`;
    const ptExpr = `COALESCE(e.pt::numeric,           ${this.sumRunComponentAmountByCodesSql('e', ['PT', 'PROFESSIONAL_TAX', 'PROFESSIONAL TAX'])})`;
    const pfEmployerExpr = `COALESCE(e.pf_employer::numeric,  ${this.sumRunComponentAmountByCodesSql('e', ['EMPLOYER_PF', 'PF_ER', 'PF_EMPLOYER', 'EPF_EMPLOYER'])})`;
    const esiEmployerExpr = `COALESCE(e.esi_employer::numeric, ${this.sumRunComponentAmountByCodesSql('e', ['EMPLOYER_ESI', 'ESI_ER', 'ESI_EMPLOYER'])})`;
    const bonusExpr = `COALESCE(e.bonus::numeric,        ${this.sumRunComponentAmountByCodesSql('e', ['BONUS', 'STATUTORY_BONUS', 'EMPLOYER_BONUS', 'BONUS_PROVISION'])})`;

    // Prefer explicit employer component breakup when present.
    // For legacy runs without breakup, use employer_cost only when it looks plausible.
    const knownEmployerBreakupExpr = `(${pfEmployerExpr}) + (${esiEmployerExpr}) + (${bonusExpr})`;
    const rawEmployerCostExpr = `COALESCE(e.employer_cost, 0)::numeric`;
    const grossExpr = `COALESCE(e.gross_earnings, 0)::numeric`;
    const derivedEmployerContributionExpr = `CASE
      WHEN ${rawEmployerCostExpr} <= 0 THEN 0
      WHEN ${rawEmployerCostExpr} <= (${grossExpr} * 0.50) THEN ${rawEmployerCostExpr}
      WHEN ${rawEmployerCostExpr} > ${grossExpr} AND ${rawEmployerCostExpr} <= (${grossExpr} * 1.50)
        THEN (${rawEmployerCostExpr} - ${grossExpr})
      ELSE 0
    END`;
    const employerContributionExpr = `CASE
      WHEN (${knownEmployerBreakupExpr}) > 0 THEN (${knownEmployerBreakupExpr})
      ELSE (${derivedEmployerContributionExpr})
    END`;
    const ctcTotalExpr = `${grossExpr} + (${employerContributionExpr})`;

    const qb = this.runRepo
      .createQueryBuilder('r')
      .select([
        `COALESCE(r.branch_id, '00000000-0000-0000-0000-000000000000') AS branch_id`,
        `COALESCE(cb.branchname, 'Unassigned') AS branch_name`,
        `COUNT(DISTINCT e.id) AS total_employees`,
        `COALESCE(SUM(e.gross_earnings), 0) AS gross_total`,
        `COALESCE(SUM(${pfEmployeeExpr}), 0) AS pf_employee`,
        `COALESCE(SUM(${pfEmployerExpr}), 0) AS pf_employer`,
        `COALESCE(SUM(${esiEmployeeExpr}), 0) AS esi_employee`,
        `COALESCE(SUM(${esiEmployerExpr}), 0) AS esi_employer`,
        `COALESCE(SUM(${ptExpr}), 0) AS pt_total`,
        `COALESCE(SUM(${bonusExpr}), 0) AS bonus_total`,
        `CASE WHEN COALESCE(SUM(${knownEmployerBreakupExpr}),0) > 0 THEN 0::numeric ELSE COALESCE(SUM(${derivedEmployerContributionExpr}),0) END AS other_employer_cost`,
        `COALESCE(SUM(${employerContributionExpr}), 0) AS employer_cost_total`,
        `COALESCE(SUM(e.net_pay), 0) AS net_pay_total`,
        `COALESCE(SUM(${ctcTotalExpr}),0) AS monthly_ctc`,
      ])
      .innerJoin('payroll_run_employees', 'e', 'e.run_id = r.id')
      .leftJoin('client_branches', 'cb', 'cb.id = r.branch_id')
      .where(runWhere, params)
      .groupBy('r.branch_id')
      .addGroupBy('cb.branchname')
      .orderBy('cb.branchname');

    return qb.getRawMany();
  }

  private sumRunComponentAmountByCodesSql(
    employeeAlias: string,
    componentCodes: string[],
  ): string {
    const normalizedCodeList = componentCodes
      .map((code) => code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter((code) => !!code)
      .map((code) => `'${code.replace(/'/g, "''")}'`)
      .join(', ');

    const normalizedComponentExpr = `regexp_replace(upper(component_code), '[^A-Z0-9]', '', 'g')`;

    return `COALESCE(
      (SELECT SUM(cv.amount) FROM payroll_run_component_values cv WHERE cv.run_employee_id = ${employeeAlias}.id AND ${normalizedComponentExpr} IN (${normalizedCodeList})),
      (SELECT SUM(i.amount) FROM payroll_run_items i WHERE i.run_employee_id = ${employeeAlias}.id AND ${normalizedComponentExpr} IN (${normalizedCodeList})),
      0
    )`;
  }

  private hasRunComponentByCodesSql(
    employeeAlias: string,
    componentCodes: string[],
  ): string {
    const normalizedCodeList = componentCodes
      .map((code) => code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter((code) => !!code)
      .map((code) => `'${code.replace(/'/g, "''")}'`)
      .join(', ');

    const normalizedComponentExpr = `regexp_replace(upper(component_code), '[^A-Z0-9]', '', 'g')`;

    return `(EXISTS (SELECT 1 FROM payroll_run_component_values cv WHERE cv.run_employee_id = ${employeeAlias}.id AND ${normalizedComponentExpr} IN (${normalizedCodeList}))
      OR EXISTS (SELECT 1 FROM payroll_run_items i WHERE i.run_employee_id = ${employeeAlias}.id AND ${normalizedComponentExpr} IN (${normalizedCodeList})))`;
  }

  private computedPfEmployeeSql(
    employeeAlias: string,
    employeeMasterAlias: string,
    setupAlias: string,
  ): string {
    const grossExpr = `COALESCE(${employeeAlias}.gross_earnings, 0)::numeric`;
    const thresholdExpr = `COALESCE(${setupAlias}.pf_gross_threshold, 0)::numeric`;
    const rateExpr = `COALESCE(${setupAlias}.pf_employee_rate, 12.0)::numeric`;
    const wageBaseExpr = `LEAST(${grossExpr}, COALESCE(NULLIF(${setupAlias}.pf_wage_ceiling::numeric, 0), 15000)::numeric)`;

    return `CASE
      WHEN COALESCE(${setupAlias}.pf_enabled, true) = false THEN 0
      WHEN ${thresholdExpr} > 0 AND ${grossExpr} <= ${thresholdExpr} THEN 0
      ELSE ROUND((${wageBaseExpr}) * (${rateExpr}) / 100.0, 2)
    END`;
  }

  private computedEsiEmployeeSql(
    employeeAlias: string,
    employeeMasterAlias: string,
    setupAlias: string,
  ): string {
    const grossExpr = `COALESCE(${employeeAlias}.gross_earnings, 0)::numeric`;
    const ceilingExpr = `COALESCE(NULLIF(${setupAlias}.esi_wage_ceiling::numeric, 0), 21000)::numeric`;
    const rateExpr = `COALESCE(${setupAlias}.esi_employee_rate, 0.75)::numeric`;

    return `CASE
      WHEN COALESCE(${setupAlias}.esi_enabled, true) = false THEN 0
      WHEN ${grossExpr} > ${ceilingExpr} THEN 0
      ELSE ROUND(${grossExpr} * (${rateExpr}) / 100.0, 2)
    END`;
  }

  private computedPtSql(
    runAlias: string,
    employeeAlias: string,
    employeeMasterAlias: string,
    setupAlias: string,
  ): string {
    const grossExpr = `COALESCE(${employeeAlias}.gross_earnings, 0)::numeric`;
    const stateExpr = `COALESCE(NULLIF(${employeeMasterAlias}.state_code, ''), NULLIF(${employeeAlias}.state_code, ''), 'ALL')`;

    return `CASE
      WHEN COALESCE(${setupAlias}.pt_enabled, false) = false THEN 0
      ELSE COALESCE(
        (
          SELECT s.value_amount::numeric
          FROM payroll_statutory_slabs s
          WHERE s.client_id = ${runAlias}.client_id
            AND regexp_replace(upper(s.component_code), '[^A-Z0-9]', '', 'g') = 'PT'
            AND ${grossExpr} >= COALESCE(s.from_amount, 0)::numeric
            AND (${grossExpr} <= COALESCE(s.to_amount, ${grossExpr})::numeric)
            AND (
              NULLIF(UPPER(${stateExpr}), 'ALL') IS NULL
              OR UPPER(s.state_code) = UPPER(${stateExpr})
              OR UPPER(s.state_code) = 'ALL'
            )
          ORDER BY CASE
                     WHEN NULLIF(UPPER(${stateExpr}), 'ALL') IS NOT NULL
                          AND UPPER(s.state_code) = UPPER(${stateExpr}) THEN 0
                     WHEN UPPER(s.state_code) = 'ALL' THEN 1
                     ELSE 2
                   END,
                   COALESCE(s.from_amount, 0)::numeric DESC
          LIMIT 1
        ),
        0
      )
    END`;
  }

  private computedEmployerShareSql(
    employeeShareExpr: string,
    employeeRateExpr: string,
    employerRateExpr: string,
  ): string {
    return `CASE
      WHEN COALESCE(${employeeRateExpr}, 0)::numeric > 0 AND (${employeeShareExpr}) > 0
        THEN ROUND(((${employeeShareExpr}) / COALESCE(${employeeRateExpr}, 0)::numeric) * COALESCE(${employerRateExpr}, 0)::numeric, 2)
      ELSE 0
    END`;
  }

  private normalizedCtcTotalSql(employeeAlias: string): string {
    return `CASE
      WHEN COALESCE(${employeeAlias}.employer_cost, 0)::numeric > COALESCE(${employeeAlias}.gross_earnings, 0)::numeric
        THEN COALESCE(${employeeAlias}.employer_cost, 0)::numeric
      ELSE COALESCE(${employeeAlias}.gross_earnings, 0)::numeric + COALESCE(${employeeAlias}.employer_cost, 0)::numeric
    END`;
  }

  private normalizedEmployerContributionSql(employeeAlias: string): string {
    const ctcExpr = this.normalizedCtcTotalSql(employeeAlias);
    return `GREATEST((${ctcExpr}) - COALESCE(${employeeAlias}.gross_earnings, 0)::numeric, 0)`;
  }

  /** Monthly trend (all months of a year) */
  private async queryMonthlyTrend(
    clientId: string,
    year: number,
    branchId?: string,
  ) {
    const knownEmployerBreakupExpr = `COALESCE(e.pf_employer, 0)::numeric + COALESCE(e.esi_employer, 0)::numeric + COALESCE(e.bonus, 0)::numeric`;
    const rawEmployerCostExpr = `COALESCE(e.employer_cost, 0)::numeric`;
    const grossExpr = `COALESCE(e.gross_earnings, 0)::numeric`;
    const derivedEmployerContributionExpr = `CASE
      WHEN ${rawEmployerCostExpr} <= 0 THEN 0
      WHEN ${rawEmployerCostExpr} <= (${grossExpr} * 0.50) THEN ${rawEmployerCostExpr}
      WHEN ${rawEmployerCostExpr} > ${grossExpr} AND ${rawEmployerCostExpr} <= (${grossExpr} * 1.50)
        THEN (${rawEmployerCostExpr} - ${grossExpr})
      ELSE 0
    END`;
    const employerContributionExpr = `CASE
      WHEN (${knownEmployerBreakupExpr}) > 0 THEN (${knownEmployerBreakupExpr})
      ELSE (${derivedEmployerContributionExpr})
    END`;
    const ctcTotalExpr = `${grossExpr} + (${employerContributionExpr})`;

    const qb = this.runRepo
      .createQueryBuilder('r')
      .select([
        'r.period_month AS month',
        'COUNT(DISTINCT e.id) AS total_employees',
        'COALESCE(SUM(e.gross_earnings), 0) AS gross_total',
        `COALESCE(SUM(${employerContributionExpr}), 0) AS employer_cost_total`,
        'COALESCE(SUM(e.net_pay), 0) AS net_pay_total',
        `COALESCE(SUM(${ctcTotalExpr}),0) AS monthly_ctc`,
      ])
      .innerJoin('payroll_run_employees', 'e', 'e.run_id = r.id')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.period_year = :year', { year })
      .andWhere(`r.status IN ('APPROVED','COMPLETED','SUBMITTED')`);

    if (branchId) {
      qb.andWhere('r.branch_id = :branchId', { branchId });
    }

    return qb.groupBy('r.period_month').orderBy('r.period_month').getRawMany();
  }

  /** Consolidate branch rows into totals */
  private consolidate(rows: BranchRow[]) {
    const n = (v: any) => Number(v) || 0;
    let totalEmployees = 0,
      grossTotal = 0,
      pfEmployee = 0,
      pfEmployer = 0;
    let esiEmployee = 0,
      esiEmployer = 0,
      ptTotal = 0,
      bonusTotal = 0;
    let otherEmployerCost = 0,
      employerCostTotal = 0,
      netPayTotal = 0,
      monthlyCTC = 0;

    for (const r of rows) {
      totalEmployees += n(r.total_employees);
      grossTotal += n(r.gross_total);
      pfEmployee += n(r.pf_employee);
      pfEmployer += n(r.pf_employer);
      esiEmployee += n(r.esi_employee);
      esiEmployer += n(r.esi_employer);
      ptTotal += n(r.pt_total);
      bonusTotal += n(r.bonus_total);
      otherEmployerCost += n(r.other_employer_cost);
      employerCostTotal += n(r.employer_cost_total);
      netPayTotal += n(r.net_pay_total);
      monthlyCTC += n(r.monthly_ctc);
    }

    return {
      totalEmployees,
      grossTotal: Math.round(grossTotal * 100) / 100,
      pfEmployee: Math.round(pfEmployee * 100) / 100,
      pfEmployer: Math.round(pfEmployer * 100) / 100,
      esiEmployee: Math.round(esiEmployee * 100) / 100,
      esiEmployer: Math.round(esiEmployer * 100) / 100,
      ptTotal: Math.round(ptTotal * 100) / 100,
      bonusTotal: Math.round(bonusTotal * 100) / 100,
      otherEmployerCost: Math.round(otherEmployerCost * 100) / 100,
      employerCostTotal: Math.round(employerCostTotal * 100) / 100,
      netPayTotal: Math.round(netPayTotal * 100) / 100,
      monthlyCTC: Math.round(monthlyCTC * 100) / 100,
      annualCTC: Math.round((monthlyCTC * 12 + bonusTotal) * 100) / 100,
    };
  }
}
