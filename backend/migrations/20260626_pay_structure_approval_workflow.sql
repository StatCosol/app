-- Phase 2B: Salary Structure Approval Workflow
-- Adds Draft → Pending → Approved/Rejected lifecycle to pay_salary_structures.
-- Resolver requires approval_status='APPROVED' (see structure-resolver.service.ts).

ALTER TABLE pay_salary_structures
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS submitted_by_id uuid NULL,
  ADD COLUMN IF NOT EXISTS submitted_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_by_id  uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_id  uuid NULL,
  ADD COLUMN IF NOT EXISTS rejected_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pay_salary_structures_approval_status'
  ) THEN
    ALTER TABLE pay_salary_structures
      ADD CONSTRAINT chk_pay_salary_structures_approval_status
      CHECK (approval_status IN ('DRAFT','PENDING','APPROVED','REJECTED'));
  END IF;
END $$;

-- Backfill: anything currently active is treated as already-approved so we
-- don't break running payroll. Inactive rows default to DRAFT.
UPDATE pay_salary_structures
   SET approval_status = 'APPROVED',
       approved_at     = COALESCE(approved_at, updated_at, now())
 WHERE approval_status = 'DRAFT'
   AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_pay_salary_structures_approval_status
  ON pay_salary_structures(client_id, approval_status);
