-- ============================================================
-- Employee Self-Service (ESS) Portal
-- 2026-02-20
--
-- Adds EMPLOYEE role, links users to employee records, enhances
-- the nomination approval workflow, and introduces a complete
-- leave-management subsystem (policies, balances, applications,
-- and an immutable ledger for audit trail).
--
-- Fully idempotent: safe to re-run on an already-migrated DB.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. EMPLOYEE role
-- ============================================================
-- Self-service role for employees logging in to view payslips,
-- apply for leave, manage nominations, etc.
INSERT INTO roles (id, code, name, is_system)
SELECT gen_random_uuid(), 'EMPLOYEE', 'Employee Self-Service', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'EMPLOYEE');

-- ============================================================
-- 2. Link users -> employees
-- ============================================================
-- When a user account is created for an employee, this column
-- ties it back to the employees table so we can scope queries
-- (payslips, nominations, leave) to the logged-in employee.
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users (employee_id);

-- ============================================================
-- 3. Nomination approval workflow columns
-- ============================================================
-- Nominations (PF, ESI, Gratuity, etc.) now flow through a
-- DRAFT -> SUBMITTED -> APPROVED / REJECTED lifecycle managed
-- by branch-level approvers.
ALTER TABLE employee_nominations
    ADD COLUMN IF NOT EXISTS client_id            UUID NULL,
    ADD COLUMN IF NOT EXISTS branch_id            UUID NULL,
    ADD COLUMN IF NOT EXISTS submitted_at         TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS approved_by_user_id  UUID NULL,
    ADD COLUMN IF NOT EXISTS rejection_reason     TEXT NULL;

-- Backfill client_id and branch_id from the employee record
-- for any existing nomination rows that were created before
-- these columns existed.
UPDATE employee_nominations en
    SET client_id = e.client_id
FROM employees e
WHERE en.employee_id = e.id
  AND en.client_id IS NULL;

UPDATE employee_nominations en
    SET branch_id = e.branch_id
FROM employees e
WHERE en.employee_id = e.id
  AND en.branch_id IS NULL;

-- Fast lookups for branch-level approval dashboards
CREATE INDEX IF NOT EXISTS idx_emp_nom_client   ON employee_nominations (client_id);
CREATE INDEX IF NOT EXISTS idx_emp_nom_branch   ON employee_nominations (branch_id);
CREATE INDEX IF NOT EXISTS idx_emp_nom_status   ON employee_nominations (status);
CREATE INDEX IF NOT EXISTS idx_emp_nom_approver ON employee_nominations (approved_by_user_id);

-- ============================================================
-- 4. Leave Policies
-- ============================================================
-- Defines the leave types available per client (and optionally
-- per branch). Accrual rules, carry-forward caps, and request
-- constraints live here.
CREATE TABLE IF NOT EXISTS leave_policies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL,
    branch_id           UUID NULL,           -- NULL = applies to all branches
    leave_type          VARCHAR(30) NOT NULL, -- CL, SL, EL, LOP, COMP_OFF, MATERNITY, PATERNITY, OTHER
    leave_name          VARCHAR(100) NOT NULL,
    accrual_method      VARCHAR(20) NOT NULL DEFAULT 'MONTHLY', -- MONTHLY, YEARLY, NONE
    accrual_rate        NUMERIC(5,2) DEFAULT 0,
    carry_forward_limit NUMERIC(5,2) DEFAULT 0,
    yearly_limit        NUMERIC(5,2) DEFAULT 0,
    allow_negative      BOOLEAN DEFAULT FALSE,
    min_notice_days     INT DEFAULT 0,
    max_days_per_request NUMERIC(5,2) DEFAULT 0,
    requires_document   BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lp_client      ON leave_policies (client_id);
CREATE INDEX IF NOT EXISTS idx_lp_client_type ON leave_policies (client_id, leave_type);

-- ============================================================
-- 5. Leave Balances
-- ============================================================
-- Denormalised running totals per employee / year / leave-type.
-- Updated by the leave-ledger triggers or batch accrual jobs.
-- The "available" column is the source of truth for front-end
-- display; it equals opening + accrued - used - lapsed.
CREATE TABLE IF NOT EXISTS leave_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL,
    client_id       UUID NOT NULL,
    year            INT NOT NULL,
    leave_type      VARCHAR(30) NOT NULL,
    opening         NUMERIC(5,2) DEFAULT 0,
    accrued         NUMERIC(5,2) DEFAULT 0,
    used            NUMERIC(5,2) DEFAULT 0,
    lapsed          NUMERIC(5,2) DEFAULT 0,
    available       NUMERIC(5,2) DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (employee_id, year, leave_type)
);

CREATE INDEX IF NOT EXISTS idx_lb_employee    ON leave_balances (employee_id);
CREATE INDEX IF NOT EXISTS idx_lb_client_year ON leave_balances (client_id, year);

-- ============================================================
-- 6. Leave Applications
-- ============================================================
-- Each row represents a single leave request from an employee.
-- Workflow: DRAFT -> SUBMITTED -> APPROVED / REJECTED / CANCELLED
CREATE TABLE IF NOT EXISTS leave_applications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id       UUID NOT NULL,
    client_id         UUID NOT NULL,
    branch_id         UUID NULL,
    leave_type        VARCHAR(30) NOT NULL,
    from_date         DATE NOT NULL,
    to_date           DATE NOT NULL,
    total_days        NUMERIC(5,2) NOT NULL,
    reason            TEXT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED
    approver_user_id  UUID NULL,
    applied_at        TIMESTAMPTZ NULL,
    actioned_at       TIMESTAMPTZ NULL,
    rejection_reason  TEXT NULL,
    attachment_path   TEXT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_la_employee ON leave_applications (employee_id);
CREATE INDEX IF NOT EXISTS idx_la_client   ON leave_applications (client_id);
CREATE INDEX IF NOT EXISTS idx_la_branch   ON leave_applications (branch_id);
CREATE INDEX IF NOT EXISTS idx_la_status   ON leave_applications (status);
CREATE INDEX IF NOT EXISTS idx_la_approver ON leave_applications (approver_user_id);

-- ============================================================
-- 7. Leave Ledger (immutable audit trail)
-- ============================================================
-- Every leave credit or debit is recorded here. Nothing is ever
-- updated or deleted -- corrections are posted as new rows.
-- qty > 0 = credit (accrual, carry-forward, manual grant)
-- qty < 0 = debit  (application approved, lapse, manual deduct)
CREATE TABLE IF NOT EXISTS leave_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL,
    client_id   UUID NOT NULL,
    leave_type  VARCHAR(30) NOT NULL,
    entry_date  DATE NOT NULL,
    qty         NUMERIC(5,2) NOT NULL, -- positive = credit, negative = debit
    ref_type    VARCHAR(30) NOT NULL,  -- ACCRUAL, APPLICATION, MANUAL, CARRY_FORWARD, LAPSE
    ref_id      UUID NULL,             -- FK to the originating record (leave_applications.id, etc.)
    remarks     TEXT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ll_employee ON leave_ledger (employee_id);
CREATE INDEX IF NOT EXISTS idx_ll_client   ON leave_ledger (client_id);

COMMIT;
