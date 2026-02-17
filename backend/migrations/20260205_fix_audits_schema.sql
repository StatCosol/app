-- Migration to fix audits table schema to match AuditEntity
-- Date: 2026-02-05
-- Purpose: Align database schema with backend entity expectations

BEGIN;

-- Ensure required columns exist (do not drop branch linkage)
ALTER TABLE audits ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS end_date DATE;

-- Rename auditor_user_id to assigned_auditor_id only when present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audits' AND column_name = 'auditor_user_id'
    ) THEN
        BEGIN
            ALTER TABLE audits RENAME COLUMN auditor_user_id TO assigned_auditor_id;
        EXCEPTION WHEN duplicate_column THEN
            -- already renamed
            NULL;
        END;
    END IF;
END $$;

-- Add new required columns
ALTER TABLE audits ADD COLUMN IF NOT EXISTS period_year INTEGER NOT NULL DEFAULT 2026;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS period_code VARCHAR(20) NOT NULL DEFAULT '2026';
ALTER TABLE audits ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS assigned_auditor_id UUID;

-- Update status values if needed (old might be 'OPEN', new uses 'PLANNED')
UPDATE audits SET status = 'PLANNED' WHERE status = 'OPEN';

-- Change id from SERIAL to UUID if needed (check first)
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns 
        WHERE table_name = 'audits' AND column_name = 'id') = 'integer' THEN
        
        -- Create new UUID column
        ALTER TABLE audits ADD COLUMN id_new UUID DEFAULT gen_random_uuid();
        
        -- Update all references (if any exist)
        -- Note: This will need manual adjustment based on your foreign key constraints
        
        -- Drop old id and rename new one
        ALTER TABLE audits DROP CONSTRAINT audits_pkey;
        ALTER TABLE audits DROP COLUMN id;
        ALTER TABLE audits RENAME COLUMN id_new TO id;
        ALTER TABLE audits ADD PRIMARY KEY (id);
    END IF;
END $$;

-- Recreate indexes for new schema
DROP INDEX IF EXISTS idx_audits_dates;
DROP INDEX IF EXISTS idx_audits_branch;

CREATE INDEX IF NOT EXISTS idx_audits_period ON audits(period_year, period_code);
CREATE INDEX IF NOT EXISTS idx_audits_assigned ON audits(assigned_auditor_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_by ON audits(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_audits_due_date ON audits(due_date);

-- Update foreign key constraints
ALTER TABLE audits DROP CONSTRAINT IF EXISTS "FK_7ad0c766d1c0da4a0d14ef3335d";
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_audits_assigned_auditor'
    ) THEN
        ALTER TABLE audits ADD CONSTRAINT "FK_audits_assigned_auditor" 
                FOREIGN KEY (assigned_auditor_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_audits_created_by'
    ) THEN
        ALTER TABLE audits ADD CONSTRAINT "FK_audits_created_by" 
                FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'audits' 
ORDER BY ordinal_position;
