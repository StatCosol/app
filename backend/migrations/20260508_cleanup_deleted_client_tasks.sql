-- ============================================================================
-- 20260508_cleanup_deleted_client_tasks.sql
-- Backfill: when the client soft-delete cascade was hardened on 2026-05-08,
-- many environments already had orphan rows for previously-deleted clients
-- (audit schedules, audits, assignments, compliance docs, etc.). This script
-- closes/cancels/deactivates them so they stop appearing in AuditXpert,
-- Legitx, CRM dashboards and user task lists.
--
-- Idempotent: each statement only touches non-terminal / still-active rows.
-- Each optional cascade is wrapped in its own DO/EXCEPTION so a missing
-- table on a particular environment does not abort the whole migration.
-- ============================================================================

-- ── Core cascades (these tables exist on every env) ─────────────────────────

UPDATE audit_schedules s
   SET status = 'CANCELLED', updated_at = NOW()
  FROM clients c
 WHERE c.id = s.client_id
   AND c.is_deleted = true
   AND s.status NOT IN ('COMPLETED','SUBMITTED','CANCELLED');

UPDATE audits a
   SET status = 'CANCELLED', updated_at = NOW()
  FROM clients c
 WHERE c.id = a.client_id
   AND c.is_deleted = true
   AND a.status NOT IN ('COMPLETED','SUBMITTED','CANCELLED','CLOSED');

UPDATE audit_frequency_rules r
   SET is_active = false, updated_at = NOW()
  FROM clients c
 WHERE c.id = r.client_id
   AND c.is_deleted = true
   AND r.is_active = true;

UPDATE compliance_tasks t
   SET status = 'CANCELLED', updated_at = NOW()
  FROM clients c
 WHERE c.id = t.client_id
   AND c.is_deleted = true
   AND t.status NOT IN ('COMPLETED','CANCELLED');

-- ── Optional / environment-specific cascades (each in its own DO block) ────

DO $$ BEGIN
  UPDATE audit_observations o
     SET status = 'CLOSED', updated_at = NOW()
    FROM audits a
    JOIN clients c ON c.id = a.client_id
   WHERE a.id = o.audit_id
     AND c.is_deleted = true
     AND o.status NOT IN ('CLOSED','RESOLVED');
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE audit_non_compliances nc
     SET status = 'CLOSED', updated_at = NOW()
    FROM audits a
    JOIN clients c ON c.id = a.client_id
   WHERE a.id = nc.audit_id
     AND c.is_deleted = true
     AND nc.status NOT IN ('CLOSED','RESOLVED','CANCELLED');
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE audit_reports r
     SET status = 'CANCELLED', updated_at = NOW()
    FROM clients c
   WHERE c.id = r.client_id
     AND c.is_deleted = true
     AND r.status NOT IN ('FINAL','PUBLISHED','CANCELLED');
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE client_assignments ca
     SET status = 'INACTIVE', updated_at = NOW()
    FROM clients c
   WHERE c.id = ca.client_id
     AND c.is_deleted = true
     AND ca.status <> 'INACTIVE';
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM client_assignments_current cac
   USING clients c
   WHERE c.id = cac.client_id
     AND c.is_deleted = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE branch_auditor_assignments b
     SET is_active = false, updated_at = NOW()
    FROM clients c
   WHERE c.id = b.client_id
     AND c.is_deleted = true
     AND b.is_active = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE compliance_documents d
     SET is_deleted = true, deleted_at = NOW()
    FROM clients c
   WHERE c.id = d.client_id
     AND c.is_deleted = true
     AND d.is_deleted = false;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE compliance_returns r
     SET is_deleted = true, deleted_at = NOW()
    FROM clients c
   WHERE c.id = r.client_id
     AND c.is_deleted = true
     AND r.is_deleted = false;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE compliance_doc_library l
     SET is_deleted = true, deleted_at = NOW()
    FROM clients c
   WHERE c.id = l.client_id
     AND c.is_deleted = true
     AND l.is_deleted = false;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE monthly_compliance_uploads u
     SET is_deleted = true
    FROM clients c
   WHERE c.id = u.client_id
     AND c.is_deleted = true
     AND u.is_deleted = false;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE crm_unit_documents d
     SET deleted_at = NOW()
    FROM clients c
   WHERE c.id = d.client_id
     AND c.is_deleted = true
     AND d.deleted_at IS NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE safety_documents s
     SET is_deleted = true
    FROM clients c
   WHERE c.id = s.client_id
     AND c.is_deleted = true
     AND s.is_deleted = false;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE contractor_employees ce
     SET is_active = false
    FROM clients c
   WHERE c.id = ce.client_id
     AND c.is_deleted = true
     AND ce.is_active = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE payroll_client_assignment p
     SET status = 'INACTIVE', updated_at = NOW()
    FROM clients c
   WHERE c.id = p.client_id
     AND c.is_deleted = true
     AND p.status <> 'INACTIVE';
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE designations d
     SET is_active = false
    FROM clients c
   WHERE c.id = d.client_id
     AND c.is_deleted = true
     AND d.is_active = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE grades g
     SET is_active = false
    FROM clients c
   WHERE c.id = g.client_id
     AND c.is_deleted = true
     AND g.is_active = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE employees e
     SET is_active = false
    FROM clients c
   WHERE c.id = e.client_id
     AND c.is_deleted = true
     AND e.is_active = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE client_department_contact d
     SET is_active = false
    FROM clients c
   WHERE c.id = d.client_id
     AND c.is_deleted = true
     AND d.is_active = true;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE sla_tasks t
     SET deleted_at = NOW()
    FROM clients c
   WHERE c.id = t.client_id
     AND c.is_deleted = true
     AND t.deleted_at IS NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE ai_audit_observations o
     SET status = 'CLOSED'
    FROM clients c
   WHERE c.id = o.client_id
     AND c.is_deleted = true
     AND o.status IS DISTINCT FROM 'CLOSED';
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END $$;
