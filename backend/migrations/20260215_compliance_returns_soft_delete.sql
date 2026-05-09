-- Soft-delete columns for compliance_returns
-- Adds is_deleted flag and metadata to align with entity changes.

ALTER TABLE compliance_returns
ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- Backfill existing rows to explicit false (defensive even with default NOT NULL)
UPDATE compliance_returns SET is_deleted = false WHERE is_deleted IS NULL;

-- Optional indexes to keep filtered queries fast (skip if already present)
CREATE INDEX IF NOT EXISTS idx_compliance_returns_is_deleted ON compliance_returns (is_deleted);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_deleted_at ON compliance_returns (deleted_at);
