-- Add missing columns to compliance_tasks that the entity expects
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_year         int NOT NULL DEFAULT 2026;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_month        int NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_label        varchar(30) NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS remarks             text NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS last_notified_at    timestamp NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS escalated_at        timestamp NULL;

-- Create indexes that the entity declares
CREATE INDEX IF NOT EXISTS "IDX_CT_CLIENT_STATUS" ON compliance_tasks (client_id, status);
CREATE INDEX IF NOT EXISTS "IDX_CT_BRANCH_STATUS" ON compliance_tasks (branch_id, status);
CREATE INDEX IF NOT EXISTS "IDX_CT_DUE_DATE"      ON compliance_tasks (due_date);
CREATE INDEX IF NOT EXISTS "IDX_CT_ASSIGNED_TO"    ON compliance_tasks (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS "IDX_CT_COMPLIANCE"     ON compliance_tasks (compliance_id);
