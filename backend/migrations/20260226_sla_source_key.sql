-- Add source_key column + unique index for SLA auto-generation deduplication
ALTER TABLE sla_tasks ADD COLUMN IF NOT EXISTS source_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sla_source_key
ON sla_tasks (client_id, branch_id, module, source_key, due_date)
WHERE deleted_at IS NULL AND source_key IS NOT NULL;
