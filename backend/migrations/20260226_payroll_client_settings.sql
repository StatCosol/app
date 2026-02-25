-- Migration: Create payroll_client_settings table for wage/salary register access toggles
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS payroll_client_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
