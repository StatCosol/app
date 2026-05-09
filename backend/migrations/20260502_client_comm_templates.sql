-- 2026-05-02 — editable email templates for monthly client communications.
-- One row per comm_type. The cron jobs render the subject/body via simple
-- {{placeholder}} substitution, falling back to the in-code defaults if the
-- row is missing.
CREATE TABLE IF NOT EXISTS client_comm_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comm_type        VARCHAR(40) NOT NULL UNIQUE,
  subject_template TEXT NOT NULL,
  body_template    TEXT NOT NULL,
  updated_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
