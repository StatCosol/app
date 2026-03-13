-- CCO Controls tables: SLA rules, escalation thresholds, reminder rules
-- These are configurable by the CCO role to manage compliance governance

CREATE TABLE IF NOT EXISTS cco_sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(100) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  target_hours INT NOT NULL,
  escalation_level1_hours INT NOT NULL,
  escalation_level2_hours INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cco_escalation_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  value INT NOT NULL,
  window_days INT NOT NULL DEFAULT 30,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cco_reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(100) NOT NULL,
  days_before_due INT NOT NULL,
  notify_roles TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default rules
INSERT INTO cco_sla_rules (scope, priority, target_hours, escalation_level1_hours, escalation_level2_hours) VALUES
  ('COMPLIANCE_TASK', 'NORMAL', 48, 24, 48),
  ('COMPLIANCE_TASK', 'HIGH', 24, 12, 24),
  ('DOCUMENT_REVIEW', 'NORMAL', 72, 48, 72),
  ('AUDIT_OBSERVATION', 'NORMAL', 120, 72, 120);

INSERT INTO cco_escalation_thresholds (type, value, window_days, severity) VALUES
  ('OVERDUE_COUNT', 5, 30, 'MEDIUM'),
  ('OVERDUE_COUNT', 10, 30, 'HIGH'),
  ('RISK_SCORE', 80, 30, 'HIGH'),
  ('RISK_SCORE', 50, 30, 'MEDIUM');

INSERT INTO cco_reminder_rules (scope, days_before_due, notify_roles) VALUES
  ('RETURN_DUE', 7, '{CRM,CLIENT}'),
  ('RETURN_DUE', 2, '{CRM,CLIENT,CCO}'),
  ('MCD_SUBMISSION', 5, '{CRM}'),
  ('AUDIT_SCHEDULE', 14, '{AUDITOR,CRM}');
