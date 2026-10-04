-- Existing employees and runs retain regular payroll semantics.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS payroll_category varchar(20) NOT NULL DEFAULT 'REGULAR';
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payroll_category varchar(20) NOT NULL DEFAULT 'REGULAR';

DO $$
DECLARE old_index record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employee_payroll_category' AND conrelid = 'employees'::regclass) THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employee_payroll_category CHECK (payroll_category IN ('REGULAR', 'INTERN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_run_payroll_category' AND conrelid = 'payroll_runs'::regclass) THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT ck_run_payroll_category CHECK (payroll_category IN ('REGULAR', 'INTERN'));
  END IF;

  -- Deployments may have TypeORM-generated names or hand-written constraints.
  -- Only replace period uniqueness; retain primary keys and unrelated indexes.
  FOR old_index IN
    SELECT idx.relname AS index_name, ns.nspname AS schema_name, c.conname
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
    WHERE i.indrelid = 'payroll_runs'::regclass AND i.indisunique AND NOT i.indisprimary
      AND i.indexprs IS NULL AND i.indpred IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(i.indkey) k(attnum)
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
          IN (ARRAY['client_id', 'period_month', 'period_year'],
              ARRAY['branch_id', 'client_id', 'period_month', 'period_year'])
  LOOP
    IF old_index.conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE payroll_runs DROP CONSTRAINT %I', old_index.conname);
    ELSE
      EXECUTE format('DROP INDEX %I.%I', old_index.schema_name, old_index.index_name);
    END IF;
  END LOOP;
END $$;

-- NULL branch denotes a client-wide run and must also be unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_run_category_period
ON payroll_runs(client_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), period_year, period_month, payroll_category);
CREATE INDEX IF NOT EXISTS idx_employee_payroll_category
ON employees(client_id, payroll_category, is_active);
