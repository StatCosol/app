-- 20260505b_sl_accrual_and_opening_balances.sql
-- 1. Add sl_accrual_divisor column to payroll_client_setup (default 60 = 0.5 SL per 30 worked days).
-- 2. Seed opening balances for PL (EL bucket) and CL (SL bucket) for year 2026
--    from the leave-balance roster supplied by the client (Veiko / Hayath).

ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS sl_accrual_divisor numeric(6,2) NOT NULL DEFAULT 60;

COMMENT ON COLUMN payroll_client_setup.sl_accrual_divisor IS
  'Number of worked days that earn 1 day of SL. Engine: SL_ACCRUED = WORKED_DAYS / sl_accrual_divisor. Default 60 (0.5 day per 30 worked days, ≈6 SL/year).';

-- ── Opening balance roster (as on April 2026) ──
-- Format: (employee_code, pl_opening, sl_opening)
-- Both leave types share the same calendar year (2026).
WITH roster(employee_code, pl_opening, sl_opening) AS (
  VALUES
    ('VEIKOD0041', 18.00, 6.00),
    ('VEIKOD0040', 10.80, 3.60),
    ('VEIKOD0039', 12.87, 4.29),
    ('VEIKOD0038', 18.00, 6.00),
    ('VEIKOD0037', 18.00, 6.00),
    ('VEIKOD0036', 18.00, 6.00),
    ('VEIKOD0035', 18.00, 6.00),
    ('VEIKOD0034', 18.00, 6.00),
    ('VEIKOD0033', 18.00, 6.00),
    ('VEIKOD0032', 18.00, 6.00),
    ('VEIKOD0031', 18.00, 6.00),
    ('VEIKOD0030', 18.00, 6.00),
    ('VEIKOD0029', 14.25, 4.75),
    ('VEIKOD0028', 18.00, 6.00),
    ('VEIKOD0027', 18.00, 6.00),
    ('VEIKOD0026', 18.00, 6.00),
    ('VEIKOD0025', 18.00, 6.00),
    ('VEIKOD0024', 18.00, 6.00),
    ('VEIKOD0023', 18.00, 6.00),
    ('VEIKOD0022', 18.00, 6.00),
    ('VEIKOD0021', 18.00, 6.00),
    ('VEIKOD0020', 18.00, 6.00),
    ('VEIKOD0019', 18.00, 6.00),
    ('VEIKOD0018', 18.00, 6.00),
    ('VEIKOD0017', 18.00, 6.00),
    ('VEIKOD0016', 18.00, 6.00),
    ('VEIKOD0015', 18.00, 6.00),
    ('VEIKOD0014', 18.00, 6.00),
    ('VEIKOD0013', 18.00, 6.00),
    ('VEIKOD0012', 18.00, 6.00),
    ('VEIKOD0011', 18.00, 6.00),
    ('VEIKOD0010', 18.00, 6.00),
    ('VEIKOD0009', 18.00, 6.00),
    ('VEIKOD0008', 18.00, 6.00),
    ('VEIKOD0007', 18.00, 6.00),
    ('VEIKOD0006', 18.00, 6.00),
    ('VEIKOD0005', 18.00, 6.00),
    ('VEIKOD0004', 18.00, 6.00),
    ('VEIKOD0003', 18.00, 6.00),
    ('VEIKOD0002', 18.00, 6.00),
    ('VEIKOD0001', 18.00, 6.00),
    ('VEIHAY0022',  1.48, 0.49),
    ('VEIHAY0021',  2.86, 0.95),
    ('VEIHAY0020', 12.67, 4.22),
    ('VEIHAY0019', 12.67, 4.22),
    ('VEIHAY0018', 12.67, 4.22),
    ('VEIHAY0017', 18.00, 6.00),
    ('VEIHAY0016', 12.87, 4.29),
    ('VEIHAY0015', 14.15, 4.72),
    ('VEIHAY0014', 14.94, 4.98),
    ('VEIHAY0013', 18.00, 6.00),
    ('VEIHAY0012', 18.00, 6.00),
    ('VEIHAY0011', 18.00, 6.00),
    ('VEIHAY0010', 18.00, 6.00),
    ('VEIHAY0009', 18.00, 6.00),
    ('VEIHAY0008', 18.00, 6.00),
    ('VEIHAY0007', 18.00, 6.00),
    ('VEIHAY0006', 18.00, 6.00),
    ('VEIHAY0005', 18.00, 6.00),
    ('VEIHAY0004', 18.00, 6.00),
    ('VEIHAY0003', 18.00, 6.00),
    ('VEIHAY0002', 18.00, 6.00),
    ('VEIHAY0001', 14.50, 4.83)
)
INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
SELECT gen_random_uuid(), e.id, e.client_id, 2026, 'EL', r.pl_opening, 0, 0, 0, r.pl_opening, NOW()
FROM roster r
JOIN employees e ON e.employee_code = r.employee_code
ON CONFLICT (employee_id, year, leave_type) DO UPDATE
  SET opening   = EXCLUDED.opening,
      available = GREATEST(EXCLUDED.opening + leave_balances.accrued - leave_balances.used, 0),
      last_updated_at = NOW();

WITH roster(employee_code, pl_opening, sl_opening) AS (
  VALUES
    ('VEIKOD0041', 18.00, 6.00),
    ('VEIKOD0040', 10.80, 3.60),
    ('VEIKOD0039', 12.87, 4.29),
    ('VEIKOD0038', 18.00, 6.00),
    ('VEIKOD0037', 18.00, 6.00),
    ('VEIKOD0036', 18.00, 6.00),
    ('VEIKOD0035', 18.00, 6.00),
    ('VEIKOD0034', 18.00, 6.00),
    ('VEIKOD0033', 18.00, 6.00),
    ('VEIKOD0032', 18.00, 6.00),
    ('VEIKOD0031', 18.00, 6.00),
    ('VEIKOD0030', 18.00, 6.00),
    ('VEIKOD0029', 14.25, 4.75),
    ('VEIKOD0028', 18.00, 6.00),
    ('VEIKOD0027', 18.00, 6.00),
    ('VEIKOD0026', 18.00, 6.00),
    ('VEIKOD0025', 18.00, 6.00),
    ('VEIKOD0024', 18.00, 6.00),
    ('VEIKOD0023', 18.00, 6.00),
    ('VEIKOD0022', 18.00, 6.00),
    ('VEIKOD0021', 18.00, 6.00),
    ('VEIKOD0020', 18.00, 6.00),
    ('VEIKOD0019', 18.00, 6.00),
    ('VEIKOD0018', 18.00, 6.00),
    ('VEIKOD0017', 18.00, 6.00),
    ('VEIKOD0016', 18.00, 6.00),
    ('VEIKOD0015', 18.00, 6.00),
    ('VEIKOD0014', 18.00, 6.00),
    ('VEIKOD0013', 18.00, 6.00),
    ('VEIKOD0012', 18.00, 6.00),
    ('VEIKOD0011', 18.00, 6.00),
    ('VEIKOD0010', 18.00, 6.00),
    ('VEIKOD0009', 18.00, 6.00),
    ('VEIKOD0008', 18.00, 6.00),
    ('VEIKOD0007', 18.00, 6.00),
    ('VEIKOD0006', 18.00, 6.00),
    ('VEIKOD0005', 18.00, 6.00),
    ('VEIKOD0004', 18.00, 6.00),
    ('VEIKOD0003', 18.00, 6.00),
    ('VEIKOD0002', 18.00, 6.00),
    ('VEIKOD0001', 18.00, 6.00),
    ('VEIHAY0022',  1.48, 0.49),
    ('VEIHAY0021',  2.86, 0.95),
    ('VEIHAY0020', 12.67, 4.22),
    ('VEIHAY0019', 12.67, 4.22),
    ('VEIHAY0018', 12.67, 4.22),
    ('VEIHAY0017', 18.00, 6.00),
    ('VEIHAY0016', 12.87, 4.29),
    ('VEIHAY0015', 14.15, 4.72),
    ('VEIHAY0014', 14.94, 4.98),
    ('VEIHAY0013', 18.00, 6.00),
    ('VEIHAY0012', 18.00, 6.00),
    ('VEIHAY0011', 18.00, 6.00),
    ('VEIHAY0010', 18.00, 6.00),
    ('VEIHAY0009', 18.00, 6.00),
    ('VEIHAY0008', 18.00, 6.00),
    ('VEIHAY0007', 18.00, 6.00),
    ('VEIHAY0006', 18.00, 6.00),
    ('VEIHAY0005', 18.00, 6.00),
    ('VEIHAY0004', 18.00, 6.00),
    ('VEIHAY0003', 18.00, 6.00),
    ('VEIHAY0002', 18.00, 6.00),
    ('VEIHAY0001', 14.50, 4.83)
)
INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
SELECT gen_random_uuid(), e.id, e.client_id, 2026, 'SL', r.sl_opening, 0, 0, 0, r.sl_opening, NOW()
FROM roster r
JOIN employees e ON e.employee_code = r.employee_code
ON CONFLICT (employee_id, year, leave_type) DO UPDATE
  SET opening   = EXCLUDED.opening,
      available = GREATEST(EXCLUDED.opening + leave_balances.accrued - leave_balances.used, 0),
      last_updated_at = NOW();
