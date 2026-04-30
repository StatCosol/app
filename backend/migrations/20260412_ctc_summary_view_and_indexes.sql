-- Migration: CTC Summary view and performance indexes
-- Date: 2026-04-12
-- Purpose: Add a convenience view and composite index for the CTC Summary feature

-- 1. Composite index for CTC queries: client + year + status together
--    (covers the main WHERE clause in CTC summary queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_client_year_status
  ON payroll_runs (client_id, period_year, status);

-- 2. Composite index for branch-scoped CTC queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_branch_year_status
  ON payroll_runs (branch_id, period_year, status);

-- 3. A view that pre-joins payroll run employees with component-level items
--    for PF, ESI, PT, and Bonus — used by CTC Summary endpoints
CREATE OR REPLACE VIEW vw_ctc_employee_components AS
SELECT
  r.id              AS run_id,
  r.client_id,
  r.branch_id,
  r.period_year,
  r.period_month,
  r.status,
  e.id              AS run_employee_id,
  e.employee_code,
  e.employee_name,
  e.gross_earnings,
  e.total_deductions,
  e.employer_cost,
  e.net_pay,
  COALESCE(i_pf_ee.amount, 0)  AS pf_employee,
  COALESCE(i_pf_er.amount, 0)  AS pf_employer,
  COALESCE(i_esi_ee.amount, 0) AS esi_employee,
  COALESCE(i_esi_er.amount, 0) AS esi_employer,
  COALESCE(i_pt.amount, 0)     AS pt,
  COALESCE(i_bonus.amount, 0)  AS bonus,
  e.gross_earnings + e.employer_cost AS monthly_ctc
FROM payroll_runs r
JOIN payroll_run_employees e ON e.run_id = r.id
LEFT JOIN payroll_run_items i_pf_ee
  ON i_pf_ee.run_employee_id = e.id AND i_pf_ee.component_code = 'PF'
LEFT JOIN payroll_run_items i_pf_er
  ON i_pf_er.run_employee_id = e.id AND i_pf_er.component_code = 'EMPLOYER_PF'
LEFT JOIN payroll_run_items i_esi_ee
  ON i_esi_ee.run_employee_id = e.id AND i_esi_ee.component_code = 'ESI'
LEFT JOIN payroll_run_items i_esi_er
  ON i_esi_er.run_employee_id = e.id AND i_esi_er.component_code = 'EMPLOYER_ESI'
LEFT JOIN payroll_run_items i_pt
  ON i_pt.run_employee_id = e.id AND i_pt.component_code = 'PT'
LEFT JOIN payroll_run_items i_bonus
  ON i_bonus.run_employee_id = e.id AND i_bonus.component_code IN ('BONUS','STATUTORY_BONUS','EMPLOYER_BONUS')
WHERE r.status IN ('APPROVED','COMPLETED','SUBMITTED');

-- 4. Branch-level CTC summary view (aggregated)
CREATE OR REPLACE VIEW vw_ctc_branch_summary AS
SELECT
  v.client_id,
  v.branch_id,
  COALESCE(cb.branchname, 'Unassigned') AS branch_name,
  v.period_year,
  v.period_month,
  COUNT(DISTINCT v.run_employee_id)     AS total_employees,
  SUM(v.gross_earnings)                 AS gross_total,
  SUM(v.pf_employee)                    AS pf_employee,
  SUM(v.pf_employer)                    AS pf_employer,
  SUM(v.esi_employee)                   AS esi_employee,
  SUM(v.esi_employer)                   AS esi_employer,
  SUM(v.pt)                             AS pt_total,
  SUM(v.bonus)                          AS bonus_total,
  SUM(v.employer_cost)                  AS employer_cost_total,
  GREATEST(SUM(v.employer_cost) - SUM(v.pf_employer) - SUM(v.esi_employer), 0)
                                        AS other_employer_cost,
  SUM(v.net_pay)                        AS net_pay_total,
  SUM(v.monthly_ctc)                    AS monthly_ctc
FROM vw_ctc_employee_components v
LEFT JOIN client_branches cb ON cb.id = v.branch_id
GROUP BY v.client_id, v.branch_id, cb.branchname, v.period_year, v.period_month;
