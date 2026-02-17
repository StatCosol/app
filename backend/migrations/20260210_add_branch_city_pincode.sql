-- Migration: add city/pincode columns to client_branches
-- Date: 2026-02-10
-- Purpose: Restore city and pincode columns expected by BranchEntity queries

BEGIN;

ALTER TABLE client_branches
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);

COMMIT;
