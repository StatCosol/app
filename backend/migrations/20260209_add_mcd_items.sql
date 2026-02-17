-- Monthly Compliance Data (MCD) itemization and item-level evidence mapping
-- Adds a checklist table per compliance task and links evidence to specific items

BEGIN;

-- Item-level checklist for MCD uploads (one row per checklist item on a task)
CREATE TABLE IF NOT EXISTS compliance_mcd_items (
  id                    bigserial PRIMARY KEY,
  task_id               bigint NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  item_key              varchar(120) NULL,        -- optional deterministic key for templates
  item_label            text NOT NULL,            -- display label/requirement
  unit_type             varchar(60) NULL,         -- e.g., FACTORY, WAREHOUSE, PAYROLL
  state_code            varchar(10) NULL,         -- e.g., TS, KA; for applicability
  required              boolean NOT NULL DEFAULT true,
  status                varchar(20) NOT NULL DEFAULT 'PENDING', -- PENDING|SUBMITTED|VERIFIED|REJECTED
  remarks               text NULL,                -- CRM remarks for rejected/verified
  verified_by_user_id   uuid NULL REFERENCES users(id),
  verified_at           timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_mcd_items_task ON compliance_mcd_items(task_id);
CREATE INDEX IF NOT EXISTS idx_compliance_mcd_items_status ON compliance_mcd_items(status);

-- Link evidence to a specific MCD item (optional)
ALTER TABLE compliance_evidence
  ADD COLUMN IF NOT EXISTS mcd_item_id bigint NULL REFERENCES compliance_mcd_items(id) ON DELETE CASCADE;

COMMIT;
