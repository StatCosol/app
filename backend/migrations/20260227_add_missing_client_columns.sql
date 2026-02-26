-- Migration: Add missing columns to clients table
-- Date: 2026-02-27
-- Description: Adds columns referenced by ClientEntity but missing from DB schema

ALTER TABLE clients ADD COLUMN IF NOT EXISTS registered_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_email VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_mobile VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_code VARCHAR(30);
