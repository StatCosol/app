-- ============================================================
-- Migration: compliance_items + compliance_rules
-- Dynamic Compliance Master for SLA auto-gen & Calendar
-- ============================================================

BEGIN;

-- ── 1. sla_compliance_items ───────────────────────
-- Master list of compliance obligations (MCD, PF, ESI, PT, etc.)
-- Named sla_compliance_items to avoid conflict with existing compliance_items table
CREATE TABLE IF NOT EXISTS sla_compliance_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. MCD_UPLOAD, PF_PAYMENT
  name          VARCHAR(200) NOT NULL,
  module        VARCHAR(30)  NOT NULL,           -- SLA module: MCD, RETURNS, REGISTRATION, AUDIT …
  frequency     VARCHAR(20)  NOT NULL DEFAULT 'MONTHLY',  -- MONTHLY / QUARTERLY / ANNUAL / ONE_TIME
  default_priority VARCHAR(15) NOT NULL DEFAULT 'MEDIUM',
  default_sla_days INT        NOT NULL DEFAULT 5,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. sla_compliance_rules ───────────────────────
-- Per-state / per-establishment-type due-date logic
CREATE TABLE IF NOT EXISTS sla_compliance_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_item_id  UUID         NOT NULL REFERENCES sla_compliance_items(id),
  state_code          VARCHAR(10)  NULL,   -- NULL = all states
  establishment_type  VARCHAR(60)  NULL,   -- NULL = all types
  applicable          BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Due-date fields (day-of-month)
  due_day             INT          NULL,   -- e.g. 15, 20, 25
  due_month_offset    INT          NOT NULL DEFAULT 0,  -- 0 = current month, 1 = next month

  -- Window-based items (MCD-style: open → close)
  window_open_day     INT          NULL,   -- e.g. 20
  window_close_day    INT          NULL,   -- e.g. 27

  -- SLA creation lead time
  create_before_days  INT          NOT NULL DEFAULT 5,

  -- Overrides
  priority            VARCHAR(15)  NULL,   -- NULL = use compliance_items.default_priority
  sla_days            INT          NULL,   -- NULL = use compliance_items.default_sla_days
  title_template      TEXT         NULL,   -- NULL = auto-generate from item name

  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_compliance_rules_item
  ON sla_compliance_rules(compliance_item_id);

CREATE INDEX IF NOT EXISTS idx_sla_compliance_rules_state
  ON sla_compliance_rules(state_code, establishment_type);

-- ── 3. Seed data ─────────────────────────────────

-- MCD Upload
INSERT INTO sla_compliance_items (code, name, module, frequency, default_priority, default_sla_days)
VALUES ('MCD_UPLOAD', 'Monthly Compliance Document Upload', 'MCD', 'MONTHLY', 'MEDIUM', 5)
ON CONFLICT (code) DO NOTHING;

-- PF Payment
INSERT INTO sla_compliance_items (code, name, module, frequency, default_priority, default_sla_days)
VALUES ('PF_PAYMENT', 'PF Payment & Filing', 'RETURNS', 'MONTHLY', 'HIGH', 5)
ON CONFLICT (code) DO NOTHING;

-- ESI Payment
INSERT INTO sla_compliance_items (code, name, module, frequency, default_priority, default_sla_days)
VALUES ('ESI_PAYMENT', 'ESI Payment & Filing', 'RETURNS', 'MONTHLY', 'HIGH', 5)
ON CONFLICT (code) DO NOTHING;

-- PT Payment
INSERT INTO sla_compliance_items (code, name, module, frequency, default_priority, default_sla_days)
VALUES ('PT_PAYMENT', 'Professional Tax Payment', 'RETURNS', 'MONTHLY', 'MEDIUM', 5)
ON CONFLICT (code) DO NOTHING;

-- ── Default rules (all states, all establishment types) ──

-- MCD: window 20th–27th, create task 5 days before open (i.e. 15th)
INSERT INTO sla_compliance_rules (compliance_item_id, state_code, establishment_type, applicable,
  window_open_day, window_close_day, create_before_days, title_template)
SELECT id, NULL, NULL, TRUE, 20, 27, 5,
       'MCD upload window ({open}–{close})'
FROM sla_compliance_items WHERE code = 'MCD_UPLOAD'
ON CONFLICT DO NOTHING;

-- PF: due 15th, create task 5 days before
INSERT INTO sla_compliance_rules (compliance_item_id, state_code, establishment_type, applicable,
  due_day, due_month_offset, create_before_days, title_template)
SELECT id, NULL, NULL, TRUE, 15, 0, 5,
       'PF Payment & Filing due ({due})'
FROM sla_compliance_items WHERE code = 'PF_PAYMENT'
ON CONFLICT DO NOTHING;

-- ESI: due 15th, create task 5 days before
INSERT INTO sla_compliance_rules (compliance_item_id, state_code, establishment_type, applicable,
  due_day, due_month_offset, create_before_days, title_template)
SELECT id, NULL, NULL, TRUE, 15, 0, 5,
       'ESI Payment & Filing due ({due})'
FROM sla_compliance_items WHERE code = 'ESI_PAYMENT'
ON CONFLICT DO NOTHING;

-- PT: due 20th, create task 5 days before
INSERT INTO sla_compliance_rules (compliance_item_id, state_code, establishment_type, applicable,
  due_day, due_month_offset, create_before_days, title_template)
SELECT id, NULL, NULL, TRUE, 20, 0, 5,
       'PT Payment due ({due})'
FROM sla_compliance_items WHERE code = 'PT_PAYMENT'
ON CONFLICT DO NOTHING;

-- ── Example: State-specific override (Karnataka PT due 20th but CRITICAL priority) ──
-- INSERT INTO sla_compliance_rules (compliance_item_id, state_code, establishment_type, applicable,
--   due_day, due_month_offset, create_before_days, priority, title_template)
-- SELECT id, 'KA', NULL, TRUE, 20, 0, 7, 'CRITICAL',
--        'PT Payment due ({due}) – Karnataka'
-- FROM sla_compliance_items WHERE code = 'PT_PAYMENT';

COMMIT;
