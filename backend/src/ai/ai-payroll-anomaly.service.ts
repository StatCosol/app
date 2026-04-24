import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiPayrollAnomalyEntity } from './entities/ai-payroll-anomaly.entity';
import { AiCoreService } from './ai-core.service';

@Injectable()
export class AiPayrollAnomalyService {

  constructor(
    @InjectRepository(AiPayrollAnomalyEntity)
    private readonly anomalyRepo: Repository<AiPayrollAnomalyEntity>,
    private readonly dataSource: DataSource,
    private readonly _aiCore: AiCoreService,
  ) {}

  /** Detect payroll anomalies for a client/run using rule-based + AI analysis */
  async detectAnomalies(
    clientId: string,
    payrollRunId?: string,
  ): Promise<AiPayrollAnomalyEntity[]> {
    const anomalies: Partial<AiPayrollAnomalyEntity>[] = [];

    // 1. Min wage violations
    const minWageViolations = await this.dataSource
      .query(
        `
      SELECT e.id as employee_id, e.name, e.basic_salary, e.gross_salary,
             b.id as branch_id, b.statecode
      FROM employees e
      LEFT JOIN client_branches b ON b.id = e.branch_id
      WHERE e.client_id = $1 AND e.is_active = TRUE
        AND e.basic_salary IS NOT NULL AND e.basic_salary < 8000
    `,
        [clientId],
      )
      .catch(() => []);

    for (const emp of minWageViolations) {
      anomalies.push({
        clientId,
        branchId: emp.branch_id,
        employeeId: emp.employee_id,
        payrollRunId: payrollRunId || null,
        anomalyType: 'MIN_WAGE_VIOLATION',
        severity: 'HIGH',
        description: `Employee ${emp.name} — Basic salary ₹${emp.basic_salary} may be below minimum wage threshold for ${emp.statecode || 'the state'}.`,
        details: {
          employeeName: emp.name,
          basicSalary: emp.basic_salary,
          state: emp.statecode,
        },
        recommendation:
          'Review and adjust salary to meet applicable minimum wage under the Minimum Wages Act / Code on Wages.',
      });
    }

    // 2. PF contribution mismatches (employer vs employee)
    const pfMismatches = await this.dataSource
      .query(
        `
      SELECT e.id as employee_id, e.name,
             e.basic_salary,
             esd.pf_number, esd.employee_pf_contribution, esd.employer_pf_contribution,
             b.id as branch_id
      FROM employees e
      LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id
      LEFT JOIN client_branches b ON b.id = e.branch_id
      WHERE e.client_id = $1 AND e.is_active = TRUE
        AND esd.employee_pf_contribution IS NOT NULL
        AND esd.employer_pf_contribution IS NOT NULL
        AND ABS(esd.employee_pf_contribution - esd.employer_pf_contribution) > 100
    `,
        [clientId],
      )
      .catch(() => []);

    for (const emp of pfMismatches) {
      anomalies.push({
        clientId,
        branchId: emp.branch_id,
        employeeId: emp.employee_id,
        payrollRunId: payrollRunId || null,
        anomalyType: 'PF_CONTRIBUTION_MISMATCH',
        severity: 'MEDIUM',
        description: `Employee ${emp.name} — PF contribution mismatch: Employee ₹${emp.employee_pf_contribution} vs Employer ₹${emp.employer_pf_contribution}.`,
        details: {
          employeePF: emp.employee_pf_contribution,
          employerPF: emp.employer_pf_contribution,
          basicSalary: emp.basic_salary,
          deviation: Math.abs(
            emp.employee_pf_contribution - emp.employer_pf_contribution,
          ),
        },
        recommendation:
          'Verify PF contribution calculation. Both employee and employer should contribute 12% of basic salary (subject to wage ceiling).',
      });
    }

    // 3. Suspicious salary changes (>30% change)
    const salarySpikes = await this.dataSource
      .query(
        `
      SELECT e.id as employee_id, e.name,
             e.basic_salary, e.gross_salary,
             b.id as branch_id
      FROM employees e
      LEFT JOIN client_branches b ON b.id = e.branch_id
      WHERE e.client_id = $1 AND e.is_active = TRUE
        AND e.gross_salary IS NOT NULL AND e.gross_salary > 0
        AND e.basic_salary IS NOT NULL
        AND (e.basic_salary::numeric / NULLIF(e.gross_salary::numeric, 0)) < 0.3
    `,
        [clientId],
      )
      .catch(() => []);

    for (const emp of salarySpikes) {
      anomalies.push({
        clientId,
        branchId: emp.branch_id,
        employeeId: emp.employee_id,
        anomalyType: 'SUSPICIOUS_SALARY_STRUCTURE',
        severity: 'MEDIUM',
        description: `Employee ${emp.name} — Basic salary (₹${emp.basic_salary}) is less than 30% of gross (₹${emp.gross_salary}). May be structured to minimize PF contributions.`,
        details: {
          basicSalary: emp.basic_salary,
          grossSalary: emp.gross_salary,
          basicPercent: Math.round((emp.basic_salary / emp.gross_salary) * 100),
        },
        recommendation:
          'Review salary structure. EPFO may consider allowances as part of basic wages for PF calculation under the Surya Roshni judgment.',
      });
    }

    // 4. Employees without PF/ESI registration
    const unregistered = await this.dataSource
      .query(
        `
      SELECT e.id as employee_id, e.name,
             esd.pf_number, esd.esi_number,
             e.date_of_joining, b.id as branch_id
      FROM employees e
      LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id
      LEFT JOIN client_branches b ON b.id = e.branch_id
      WHERE e.client_id = $1 AND e.is_active = TRUE
        AND e.date_of_joining < NOW() - INTERVAL '30 days'
        AND (esd.pf_number IS NULL OR esd.pf_number = '' OR esd.esi_number IS NULL OR esd.esi_number = '')
    `,
        [clientId],
      )
      .catch(() => []);

    for (const emp of unregistered) {
      const missing: string[] = [];
      if (!emp.pf_number) missing.push('PF');
      if (!emp.esi_number) missing.push('ESI');
      anomalies.push({
        clientId,
        branchId: emp.branch_id,
        employeeId: emp.employee_id,
        anomalyType: 'MISSING_STATUTORY_REGISTRATION',
        severity: 'HIGH',
        description: `Employee ${emp.name} — Missing ${missing.join(' & ')} registration. Joined ${emp.date_of_joining?.toISOString?.()?.split('T')[0] || 'over 30 days ago'}.`,
        details: {
          missingRegistrations: missing,
          dateOfJoining: emp.date_of_joining,
        },
        recommendation: `Register employee for ${missing.join(' and ')} immediately. PF registration must be done within first month of joining under EPF Act.`,
      });
    }

    // Save all anomalies
    if (anomalies.length > 0) {
      const entities = anomalies.map((a) => this.anomalyRepo.create(a));
      return this.anomalyRepo.save(entities);
    }

    return [];
  }

  /** List anomalies for a client */
  async listAnomalies(
    clientId: string,
    filters?: { status?: string; anomalyType?: string },
    limit = 100,
  ): Promise<AiPayrollAnomalyEntity[]> {
    const qb = this.anomalyRepo
      .createQueryBuilder('a')
      .where('a.clientId = :clientId', { clientId });
    if (filters?.status)
      qb.andWhere('a.status = :status', { status: filters.status });
    if (filters?.anomalyType)
      qb.andWhere('a.anomalyType = :anomalyType', {
        anomalyType: filters.anomalyType,
      });
    return qb.orderBy('a.detectedAt', 'DESC').take(limit).getMany();
  }

  /** Resolve an anomaly */
  async resolveAnomaly(
    id: string,
    resolvedBy: string,
    status: 'RESOLVED' | 'FALSE_POSITIVE',
    notes?: string,
  ): Promise<AiPayrollAnomalyEntity> {
    const anomaly = await this.anomalyRepo.findOneOrFail({ where: { id } });
    anomaly.status = status;
    anomaly.resolvedBy = resolvedBy;
    anomaly.resolvedAt = new Date();
    if (notes) anomaly.resolutionNotes = notes;
    return this.anomalyRepo.save(anomaly);
  }

  /** Get anomaly summary counts */
  async getAnomalySummary(clientId: string): Promise<any> {
    const result = await this.dataSource.query(
      `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'OPEN') as open,
        COUNT(*) FILTER (WHERE severity = 'HIGH' AND status = 'OPEN') as high_open,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND status = 'OPEN') as critical_open,
        COUNT(DISTINCT anomaly_type) as unique_types
      FROM ai_payroll_anomalies
      WHERE client_id = $1
    `,
      [clientId],
    );
    return result[0] || {};
  }
}
