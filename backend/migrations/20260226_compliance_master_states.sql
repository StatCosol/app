-- ============================================================
-- Migration: Compliance Master – state-wise rules for AP/TG/TN/KA
-- Adds due_month column, new PT_PAYMENT_HALF_YEARLY item,
-- corrects PF/ESI to due_month_offset=1, adds state-specific PT rules.
-- ============================================================

BEGIN;

-- ── 1. Add due_month column to sla_compliance_rules ──────────
ALTER TABLE sla_compliance_rules
  ADD COLUMN IF NOT EXISTS due_month INT NULL;
-- due_month: 1-12 for fixed-month deadlines (e.g., half-yearly TN PT Sep=9, Mar=3)

-- ── 2. Clear old default-only seed data so we can re-seed correctly ──
DELETE FROM sla_compliance_rules;
DELETE FROM sla_compliance_items;

-- ── 3. Seed compliance items ─────────────────────────────────
INSERT INTO sla_compliance_items (code, name, module, frequency, default_priority, default_sla_days) VALUES
  ('PF_PAYMENT',             'PF Payment & ECR Filing',                     'RETURNS', 'MONTHLY',     'HIGH',   5),
  ('ESI_PAYMENT',            'ESI Contribution Payment & Filing',           'RETURNS', 'MONTHLY',     'HIGH',   5),
  ('PT_PAYMENT',             'Professional Tax Remittance',                 'RETURNS', 'MONTHLY',     'MEDIUM', 5),
  ('PT_PAYMENT_HALF_YEARLY', 'Professional Tax Remittance (Half-Yearly)',   'RETURNS', 'HALF_YEARLY', 'MEDIUM', 10),
  ('MCD_UPLOAD',             'Monthly Compliance Data Upload',              'MCD',     'MONTHLY',     'MEDIUM', 7)
ON CONFLICT (code) DO UPDATE SET
  name             = EXCLUDED.name,
  module           = EXCLUDED.module,
  frequency        = EXCLUDED.frequency,
  default_priority = EXCLUDED.default_priority,
  default_sla_days = EXCLUDED.default_sla_days;

-- ── 4. Seed compliance rules ─────────────────────────────────

-- A) PF – All India, 15th of NEXT month (offset=1)
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, NULL, NULL, TRUE, 15, 1, 5, NULL,
       'PF Payment & ECR Filing due ({due})', TRUE
FROM sla_compliance_items WHERE code = 'PF_PAYMENT';

-- B) ESI – All India, 15th of NEXT month (offset=1)
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, NULL, NULL, TRUE, 15, 1, 5, NULL,
       'ESI Contribution Payment & Filing due ({due})', TRUE
FROM sla_compliance_items WHERE code = 'ESI_PAYMENT';

-- C) PT – Andhra Pradesh: 10th of succeeding month
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, 'AP', NULL, TRUE, 10, 1, 3, NULL,
       'PT Remittance due ({due}) – Andhra Pradesh', TRUE
FROM sla_compliance_items WHERE code = 'PT_PAYMENT';

-- D) PT – Telangana: 10th of succeeding month
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, 'TG', NULL, TRUE, 10, 1, 3, NULL,
       'PT Remittance due ({due}) – Telangana', TRUE
FROM sla_compliance_items WHERE code = 'PT_PAYMENT';

-- E) PT – Karnataka: 20th of succeeding month
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, 'KA', NULL, TRUE, 20, 1, 5, NULL,
       'PT Remittance due ({due}) – Karnataka', TRUE
FROM sla_compliance_items WHERE code = 'PT_PAYMENT';

-- F) PT – Tamil Nadu: Half-Yearly (Sep 30 + Mar 31)
--    Uses due_month + due_day (no offset needed for half-yearly)
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, 'TN', NULL, TRUE, 30, 9, 0, 10, NULL,
       'PT Remittance due Sep 30 – Tamil Nadu (Half-Yearly)', TRUE
FROM sla_compliance_items WHERE code = 'PT_PAYMENT_HALF_YEARLY';

INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, due_day, due_month, due_month_offset, create_before_days, priority, title_template, is_active)
SELECT id, 'TN', NULL, TRUE, 31, 3, 0, 10, NULL,
       'PT Remittance due Mar 31 – Tamil Nadu (Half-Yearly)', TRUE
FROM sla_compliance_items WHERE code = 'PT_PAYMENT_HALF_YEARLY';

-- G) MCD Window – All India default 20–25
INSERT INTO sla_compliance_rules
  (compliance_item_id, state_code, establishment_type, applicable, window_open_day, window_close_day, create_before_days, priority, title_template, is_active)
SELECT id, NULL, NULL, TRUE, 20, 25, 0, NULL,
       'MCD upload window ({open}–{close})', TRUE
FROM sla_compliance_items WHERE code = 'MCD_UPLOAD';

COMMIT;
