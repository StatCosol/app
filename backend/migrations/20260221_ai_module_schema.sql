-- ============================================================
-- AI Module Schema: Risk Engine + Audit Observation AI
-- StatComPy Phase 1 AI Features
-- ============================================================

-- 1. AI Configuration (API keys, model prefs)
CREATE TABLE IF NOT EXISTS ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'openai',        -- openai | azure | anthropic
  model_name VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  api_key_encrypted TEXT,                                 -- encrypted at rest
  temperature NUMERIC(3,2) DEFAULT 0.3,
  max_tokens INT DEFAULT 2000,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Risk Assessments — per client/branch risk scores
CREATE TABLE IF NOT EXISTS ai_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  branch_id UUID REFERENCES client_branches(id),                 -- NULL = client-level
  assessment_type VARCHAR(50) NOT NULL DEFAULT 'COMPLIANCE', -- COMPLIANCE | PAYROLL | CONTRACTOR | AUDIT
  
  -- Scoring
  risk_score INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',       -- LOW | MEDIUM | HIGH | CRITICAL
  inspection_probability NUMERIC(5,2),                    -- 0.00 - 100.00%
  penalty_exposure_min NUMERIC(12,2),                     -- ₹ min estimated
  penalty_exposure_max NUMERIC(12,2),                     -- ₹ max estimated
  
  -- AI Analysis
  summary TEXT NOT NULL,                                  -- Human-readable summary
  risk_factors JSONB DEFAULT '[]',                        -- [{factor, weight, value, detail}]
  recommendations JSONB DEFAULT '[]',                     -- [{priority, action, impact}]
  predictions JSONB DEFAULT '{}',                         -- {inspectionTimeframe, trendDirection, etc}
  
  -- Input snapshot
  input_data JSONB DEFAULT '{}',                          -- raw data used for scoring
  ai_model VARCHAR(100),
  ai_prompt_tokens INT,
  ai_completion_tokens INT,
  
  -- Metadata
  assessed_by UUID REFERENCES users(id),                  -- user who triggered
  period_month INT,
  period_year INT,
  expires_at TIMESTAMPTZ,                                 -- when to re-assess
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_client ON ai_risk_assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_risk_branch ON ai_risk_assessments(branch_id);
CREATE INDEX IF NOT EXISTS idx_risk_type ON ai_risk_assessments(assessment_type);
CREATE INDEX IF NOT EXISTS idx_risk_level ON ai_risk_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_created ON ai_risk_assessments(created_at DESC);

-- 3. AI Audit Observations — AI-generated observation drafts
CREATE TABLE IF NOT EXISTS ai_audit_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  branch_id UUID REFERENCES client_branches(id),
  
  -- Input
  finding_type VARCHAR(100),                              -- PF_SHORT_REMITTANCE, ESI_DELAY, etc
  finding_description TEXT NOT NULL,                       -- auditor's raw finding
  uploaded_documents JSONB DEFAULT '[]',                   -- [{fileName, fileUrl, analysis}]
  
  -- AI-Generated Observation
  observation_title VARCHAR(500),
  observation_text TEXT,                                   -- DTSS-style full observation
  consequence TEXT,                                        -- legal consequence
  section_reference TEXT,                                  -- Act, Section, Rule
  fine_estimation_min NUMERIC(12,2),
  fine_estimation_max NUMERIC(12,2),
  risk_rating VARCHAR(20) DEFAULT 'MEDIUM',               -- LOW | MEDIUM | HIGH | CRITICAL
  corrective_action TEXT,                                  -- recommended action
  timeline_days INT,                                       -- recommended resolution days
  
  -- State references
  applicable_state VARCHAR(100),                           -- Telangana, Maharashtra, etc
  state_specific_rules TEXT,                                -- state-level rule references
  
  -- AI metadata
  ai_model VARCHAR(100),
  ai_prompt_tokens INT,
  ai_completion_tokens INT,
  confidence_score NUMERIC(5,2),                           -- 0-100% AI confidence
  
  -- Workflow
  status VARCHAR(30) DEFAULT 'DRAFT',                      -- DRAFT | REVIEWED | APPROVED | REJECTED
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  auditor_notes TEXT,                                      -- auditor's manual edits/notes
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_obs_audit ON ai_audit_observations(audit_id);
CREATE INDEX IF NOT EXISTS idx_ai_obs_client ON ai_audit_observations(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_obs_status ON ai_audit_observations(status);

-- 4. AI Payroll Anomalies — flagged payroll issues
CREATE TABLE IF NOT EXISTS ai_payroll_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  branch_id UUID REFERENCES client_branches(id),
  employee_id UUID,
  payroll_run_id UUID,
  
  anomaly_type VARCHAR(100) NOT NULL,                     -- MIN_WAGE_VIOLATION, OT_EXCESS, CONTRIBUTION_MISMATCH, etc
  severity VARCHAR(20) DEFAULT 'MEDIUM',                  -- LOW | MEDIUM | HIGH | CRITICAL
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',                             -- {expected, actual, deviation%, etc}
  recommendation TEXT,
  
  -- Status
  status VARCHAR(30) DEFAULT 'OPEN',                      -- OPEN | ACKNOWLEDGED | RESOLVED | FALSE_POSITIVE
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_client ON ai_payroll_anomalies(client_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_type ON ai_payroll_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_status ON ai_payroll_anomalies(status);

-- 5. AI Document Analysis — smart document review results
CREATE TABLE IF NOT EXISTS ai_document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  branch_id UUID REFERENCES client_branches(id),
  document_type VARCHAR(100),                              -- PF_CHALLAN, ESI_CONTRIBUTION, LICENSE, INSURANCE
  file_name VARCHAR(500),
  file_url TEXT,
  
  -- Analysis results
  analysis_result JSONB DEFAULT '{}',                      -- {findings: [], warnings: [], mismatches: []}
  issues_found INT DEFAULT 0,
  expiry_date DATE,                                        -- extracted expiry
  days_until_expiry INT,                                   -- computed
  amount_expected NUMERIC(14,2),
  amount_found NUMERIC(14,2),
  headcount_expected INT,
  headcount_found INT,
  
  -- AI metadata
  ai_model VARCHAR(100),
  confidence_score NUMERIC(5,2),
  
  status VARCHAR(30) DEFAULT 'ANALYZED',                   -- ANALYZED | REVIEWED | FLAGGED
  reviewed_by UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_analysis_client ON ai_document_analyses(client_id);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_type ON ai_document_analyses(document_type);

-- 6. AI Insights Log — predictive intelligence entries
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  branch_id UUID REFERENCES client_branches(id),
  
  insight_type VARCHAR(100) NOT NULL,                      -- COMPLIANCE_PREDICTION, CONTRACTOR_RISK, PAYROLL_TREND, INSPECTION_ALERT
  category VARCHAR(50) DEFAULT 'GENERAL',                  -- COMPLIANCE | PAYROLL | AUDIT | CONTRACTOR | MCD
  severity VARCHAR(20) DEFAULT 'INFO',                     -- INFO | WARNING | ALERT | CRITICAL
  
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  data JSONB DEFAULT '{}',                                 -- supporting data
  
  is_dismissed BOOLEAN DEFAULT FALSE,
  dismissed_by UUID REFERENCES users(id),
  
  valid_until TIMESTAMPTZ,                                 -- when the insight expires
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_client ON ai_insights(client_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_severity ON ai_insights(severity);

-- Seed default AI config (no API key — user must configure)
INSERT INTO ai_configurations (provider, model_name, temperature, max_tokens, is_active)
VALUES ('openai', 'gpt-4o-mini', 0.3, 2000, true)
ON CONFLICT DO NOTHING;
