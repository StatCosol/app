-- =====================================================================
-- Phase 2 — Audit Remark Master (AI Observation Learning Library)
-- =====================================================================
-- Stores curated/approved audit observations so AI calls can be served
-- from cache when a similar finding is submitted again.
-- pg_trgm provides fuzzy similarity for finding-text matching.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS audit_remark_master (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Optional scoping (nullable = applies broadly)
    client_id               uuid           NULL REFERENCES clients(id) ON DELETE SET NULL,
    state_code              varchar(8)     NULL,
    act_code                varchar(64)    NULL,
    compliance_area         varchar(120)   NULL,
    document_type           varchar(120)   NULL,
    finding_type            varchar(120)   NULL,

    -- Free-form raw + normalized finding text used for matching
    raw_finding             text           NOT NULL,
    normalized_finding      text           NOT NULL,
    finding_signature       varchar(64)    NULL,

    -- Curated observation payload (mirrors AiAuditObservationEntity output)
    observation_title       varchar(500)   NULL,
    observation_text        text           NULL,
    consequence             text           NULL,
    section_reference       text           NULL,
    fine_estimation_min     numeric(14,2)  NULL,
    fine_estimation_max     numeric(14,2)  NULL,
    risk_rating             varchar(16)    NULL,
    corrective_action       text           NULL,
    timeline_days           int            NULL,
    state_specific_rules    text           NULL,

    -- Provenance
    source                  varchar(32)    NOT NULL DEFAULT 'AI', -- AI | HUMAN | SEED
    confidence_score        int            NULL,
    created_by              uuid           NULL,
    approved_by             uuid           NULL,
    approved_at             timestamptz    NULL,

    -- Stats
    usage_count             int            NOT NULL DEFAULT 0,
    last_used_at            timestamptz    NULL,
    is_active               boolean        NOT NULL DEFAULT true,

    created_at              timestamptz    NOT NULL DEFAULT now(),
    updated_at              timestamptz    NOT NULL DEFAULT now()
);

-- Trigram GIN index for fast fuzzy matching on normalized_finding
CREATE INDEX IF NOT EXISTS idx_arm_normalized_finding_trgm
  ON audit_remark_master USING gin (normalized_finding gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_arm_state_act
  ON audit_remark_master (state_code, act_code) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_arm_finding_type
  ON audit_remark_master (finding_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_arm_signature
  ON audit_remark_master (finding_signature) WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_audit_remark_master_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_remark_master_touch ON audit_remark_master;
CREATE TRIGGER audit_remark_master_touch
  BEFORE UPDATE ON audit_remark_master
  FOR EACH ROW EXECUTE FUNCTION trg_audit_remark_master_touch();

COMMENT ON TABLE audit_remark_master IS
  'AI Observation Learning Library — caches curated/approved audit observations for reuse across similar findings.';
