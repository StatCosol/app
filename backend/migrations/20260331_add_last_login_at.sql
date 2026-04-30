-- Migration: 20260331_add_missing_columns.sql
-- Purpose: Add columns referenced by code but missing from production DB
-- Idempotent: Uses IF NOT EXISTS guards

-- users.last_login_at (used by admin dashboard + reports)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- client_assignments per-role rotation date columns (used by admin dashboard SQL + entity)
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS crm_assigned_from DATE;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS crm_assigned_to DATE;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS auditor_assigned_from DATE;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS auditor_assigned_to DATE;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS created_by UUID;
