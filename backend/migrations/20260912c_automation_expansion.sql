ALTER TABLE automation_controls DROP CONSTRAINT IF EXISTS automation_controls_rule_key_check;
ALTER TABLE automation_controls ADD CONSTRAINT automation_controls_rule_key_check CHECK (rule_key IN ('expiry','task_reminders','filing_overdue','nc_reminders','monthly_filings','monthly_cycles','audit_schedules','applicability','gap_review'));
ALTER TABLE automation_controls ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'DAILY' CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY'));
ALTER TABLE automation_controls ADD COLUMN IF NOT EXISTS week_day integer NOT NULL DEFAULT 0 CHECK (week_day BETWEEN 0 AND 6);
ALTER TABLE automation_controls ADD COLUMN IF NOT EXISTS month_day integer NOT NULL DEFAULT 1 CHECK (month_day BETWEEN 1 AND 31);
ALTER TABLE automation_controls ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO automation_controls (rule_key,local_time,frequency,enabled) VALUES
 ('monthly_filings','02:00','MONTHLY',true), ('monthly_cycles','01:00','MONTHLY',true),
 ('audit_schedules','02:00','DAILY',true), ('applicability','03:00','DAILY',true),
 ('gap_review','09:00','WEEKLY',false)
ON CONFLICT DO NOTHING;
