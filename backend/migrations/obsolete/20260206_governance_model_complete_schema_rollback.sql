-- ============================================================================
-- ROLLBACK SCRIPT FOR GOVERNANCE MODEL SCHEMA
-- Drops all tables, views, functions, and triggers in reverse dependency order
-- ============================================================================

-- Drop triggers
DROP TRIGGER IF EXISTS trg_set_rotation_due_date ON client_assignments;

-- Drop functions
DROP FUNCTION IF EXISTS set_rotation_due_date();
DROP FUNCTION IF EXISTS calculate_rotation_due_date(TEXT, DATE);

-- Drop views
DROP VIEW IF EXISTS admin_system_health_view;
DROP VIEW IF EXISTS admin_escalations_view;

-- Drop tables (reverse dependency order)
DROP TABLE IF EXISTS evidence_links;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS audit_reports;
DROP TABLE IF EXISTS audit_observations;
DROP TABLE IF EXISTS audits;
DROP TABLE IF EXISTS branch_compliance_schedule;
DROP TABLE IF EXISTS compliance_items;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS client_assignment_history;
DROP TABLE IF EXISTS client_assignments;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS clients;

-- ============================================================================
-- END OF ROLLBACK
-- ============================================================================
