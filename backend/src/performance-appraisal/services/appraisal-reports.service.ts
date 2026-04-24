import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppraisalReportsService {
  constructor(private readonly dataSource: DataSource) {}

  async branchSummary(clientId: string, cycleId?: string) {
    let where = 'ea.client_id = $1';
    const params: any[] = [clientId];
    if (cycleId) {
      where += ' AND ea.cycle_id = $2';
      params.push(cycleId);
    }

    return this.dataSource.query(`
      SELECT b.branchname AS branch_name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ea.status IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS completed,
             COUNT(*) FILTER (WHERE ea.status NOT IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS pending,
             ROUND(AVG(ea.total_score)::numeric, 2) AS avg_score,
             COUNT(*) FILTER (WHERE ea.recommendation = 'INCREMENT')::int AS increment_count,
             COUNT(*) FILTER (WHERE ea.recommendation = 'PROMOTION')::int AS promotion_count,
             COUNT(*) FILTER (WHERE ea.recommendation = 'PIP')::int AS pip_count
      FROM employee_appraisals ea
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      WHERE ${where}
      GROUP BY b.branchname
      ORDER BY avg_score DESC NULLS LAST
    `, params);
  }

  async departmentSummary(clientId: string, cycleId?: string) {
    let where = 'ea.client_id = $1';
    const params: any[] = [clientId];
    if (cycleId) {
      where += ' AND ea.cycle_id = $2';
      params.push(cycleId);
    }

    return this.dataSource.query(`
      SELECT e.department,
             COUNT(*)::int AS total,
             ROUND(AVG(ea.total_score)::numeric, 2) AS avg_score,
             COUNT(*) FILTER (WHERE ea.status IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS completed,
             COUNT(*) FILTER (WHERE ea.recommendation = 'INCREMENT')::int AS increment_count,
             COUNT(*) FILTER (WHERE ea.recommendation = 'PROMOTION')::int AS promotion_count,
             COUNT(*) FILTER (WHERE ea.recommendation = 'PIP')::int AS pip_count
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ${where}
      GROUP BY e.department
      ORDER BY avg_score DESC NULLS LAST
    `, params);
  }

  async recommendations(clientId: string, cycleId?: string) {
    let where = 'ea.client_id = $1';
    const params: any[] = [clientId];
    if (cycleId) {
      where += ' AND ea.cycle_id = $2';
      params.push(cycleId);
    }

    return this.dataSource.query(`
      SELECT ea.recommendation, COUNT(*)::int AS count,
             ROUND(AVG(ea.total_score)::numeric, 2) AS avg_score
      FROM employee_appraisals ea
      WHERE ${where} AND ea.recommendation IS NOT NULL
      GROUP BY ea.recommendation
      ORDER BY count DESC
    `, params);
  }

  async exportData(clientId: string, cycleId?: string) {
    let where = 'ea.client_id = $1';
    const params: any[] = [clientId];
    if (cycleId) {
      where += ' AND ea.cycle_id = $2';
      params.push(cycleId);
    }

    return this.dataSource.query(`
      SELECT e.employee_code, e.name AS employee_name, e.department, e.designation,
             e.date_of_joining, b.branchname AS branch_name, e.ctc, e.monthly_gross,
             ac.cycle_name, ac.financial_year,
             ea.status, ea.total_score, ea.final_rating_code, ea.final_rating_label,
             ea.recommendation, ea.recommended_increment_percent, ea.recommended_new_ctc,
             ea.pip_required, ea.final_remarks
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      JOIN appraisal_cycles ac ON ea.cycle_id = ac.id
      WHERE ${where}
      ORDER BY b.branchname, e.name
    `, params);
  }
}
