-- Migration: Safety Documents v2 – Master List, Categories, Verification, Risk Score
-- Date: 2026-03-04
-- Adds: safety_document_master (seed), new columns on safety_documents

-- ═══════════════════════════════════════════════════════════════
-- 1. Create Safety Document Master table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS safety_document_master (
  id              SERIAL PRIMARY KEY,
  document_name   VARCHAR(255) NOT NULL,
  category        VARCHAR(100) NOT NULL,
  frequency       VARCHAR(30) NOT NULL,  -- MONTHLY, QUARTERLY, HALF_YEARLY, ANNUAL, EVENT_BASED, AS_NEEDED
  applicable_to   VARCHAR(100) NOT NULL DEFAULT 'ALL', -- FACTORY, ESTABLISHMENT, WAREHOUSE, ALL
  is_mandatory    BOOLEAN DEFAULT FALSE,
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdm_category ON safety_document_master(category);
CREATE INDEX IF NOT EXISTS idx_sdm_frequency ON safety_document_master(frequency);

-- ═══════════════════════════════════════════════════════════════
-- 2. Alter safety_documents table – add new columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS frequency VARCHAR(30);
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS applicable_to VARCHAR(100) DEFAULT 'ALL';
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS period_month INT;       -- 1-12
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS period_quarter INT;     -- 1-4
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS period_year INT;        -- e.g. 2026
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT FALSE;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS verified_by_crm BOOLEAN DEFAULT FALSE;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS crm_verified_at TIMESTAMPTZ;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS crm_verified_by UUID;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS verified_by_auditor BOOLEAN DEFAULT FALSE;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS auditor_verified_at TIMESTAMPTZ;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS auditor_verified_by UUID;
ALTER TABLE safety_documents ADD COLUMN IF NOT EXISTS master_document_id INT REFERENCES safety_document_master(id);

CREATE INDEX IF NOT EXISTS idx_safety_docs_category ON safety_documents(category) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_safety_docs_frequency ON safety_documents(frequency) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_safety_docs_period ON safety_documents(period_year, period_month) WHERE is_deleted = FALSE;

-- ═══════════════════════════════════════════════════════════════
-- 3. Seed Safety Document Master List (100+ documents)
-- ═══════════════════════════════════════════════════════════════

-- Clear existing seed data if re-running
TRUNCATE safety_document_master RESTART IDENTITY CASCADE;

-- ─── MONTHLY: Safety Inspections (category = 'Safety Inspections') ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Monthly Safety Inspection Checklist',       'Safety Inspections',    'MONTHLY', 'ALL',           true,  1),
('Housekeeping Inspection Report',            'Safety Inspections',    'MONTHLY', 'ALL',           true,  2),
('Workplace Hazard Identification Checklist', 'Safety Inspections',    'MONTHLY', 'FACTORY',       true,  3),
('Machine Guarding Inspection Checklist',     'Safety Inspections',    'MONTHLY', 'FACTORY',       true,  4),
('Electrical Safety Visual Inspection Checklist','Safety Inspections', 'MONTHLY', 'ALL',           true,  5),
('Emergency Exit Inspection Checklist',       'Safety Inspections',    'MONTHLY', 'ALL',           true,  6),
('Fire Extinguisher Visual Inspection Checklist','Safety Inspections', 'MONTHLY', 'ALL',           true,  7),
('First Aid Box Inspection Checklist',        'Safety Inspections',    'MONTHLY', 'ALL',           true,  8),
('PPE Compliance Inspection',                 'Safety Inspections',    'MONTHLY', 'FACTORY',       true,  9),
('Chemical Storage Inspection Checklist',     'Safety Inspections',    'MONTHLY', 'FACTORY',       false, 10),
('Ladder & Work-at-Height Equipment Inspection','Safety Inspections',  'MONTHLY', 'FACTORY',       false, 11);

-- ─── MONTHLY: Incident Reports ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Accident Register Update',                  'Incident Reports',      'MONTHLY', 'ALL',           true,  12),
('Near Miss Report',                          'Incident Reports',      'MONTHLY', 'ALL',           true,  13),
('Unsafe Act / Unsafe Condition Report',      'Incident Reports',      'MONTHLY', 'ALL',           true,  14),
('Incident Investigation Report',             'Incident Reports',      'MONTHLY', 'ALL',           false, 15),
('Corrective Action Status Report',           'Incident Reports',      'MONTHLY', 'ALL',           false, 16);

-- ─── MONTHLY: Training & Awareness ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Toolbox Talk Record',                       'Training & Awareness',  'MONTHLY', 'ALL',           true,  17),
('Safety Awareness Training Attendance',      'Training & Awareness',  'MONTHLY', 'ALL',           true,  18),
('Safety Meeting Minutes',                    'Training & Awareness',  'MONTHLY', 'ALL',           true,  19);

-- ─── MONTHLY: Health & Hygiene ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Toilet Cleaning & Sanitation Checklist',    'Medical & Health',      'MONTHLY', 'ALL',           true,  20),
('Drinking Water Potability Record',          'Medical & Health',      'MONTHLY', 'ALL',           true,  21),
('Pest Control Service Record',               'Medical & Health',      'MONTHLY', 'ALL',           false, 22),
('Waste Disposal Checklist',                  'Medical & Health',      'MONTHLY', 'ALL',           false, 23);

-- ─── QUARTERLY: Safety Audits ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Internal Safety Audit Report',              'Safety Audits',         'QUARTERLY', 'ALL',         true,  24),
('Fire Safety Audit Report',                  'Safety Audits',         'QUARTERLY', 'ALL',         true,  25),
('Electrical Safety Audit Report',            'Safety Audits',         'QUARTERLY', 'ALL',         true,  26),
('Workplace Risk Assessment Review',          'Safety Audits',         'QUARTERLY', 'ALL',         false, 27);

-- ─── QUARTERLY: Equipment Inspections ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Crane Inspection Report',                   'Equipment Inspections', 'QUARTERLY', 'FACTORY',     false, 28),
('Hoist Inspection Report',                   'Equipment Inspections', 'QUARTERLY', 'FACTORY',     false, 29),
('Lifting Equipment Inspection Certificate',  'Equipment Inspections', 'QUARTERLY', 'FACTORY',     false, 30),
('Forklift Inspection Report',                'Equipment Inspections', 'QUARTERLY', 'FACTORY',     false, 31),
('Pressure Vessel Inspection Report',         'Equipment Inspections', 'QUARTERLY', 'FACTORY',     false, 32),
('Air Compressor Inspection',                 'Equipment Inspections', 'QUARTERLY', 'FACTORY',     false, 33);

-- ─── QUARTERLY: Health Monitoring ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Occupational Health Monitoring Report',     'Medical & Health',      'QUARTERLY', 'FACTORY',     true,  34),
('Noise Level Monitoring Report',             'Medical & Health',      'QUARTERLY', 'FACTORY',     false, 35),
('Air Quality Monitoring Report',             'Medical & Health',      'QUARTERLY', 'FACTORY',     false, 36);

-- ─── QUARTERLY: Safety Committee ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Safety Committee Meeting Minutes',          'Safety Audits',         'QUARTERLY', 'FACTORY',     true,  37),
('Safety Committee Attendance Register',      'Safety Audits',         'QUARTERLY', 'FACTORY',     true,  38);

-- ─── HALF YEARLY: Health Surveillance ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Half-Yearly Medical Examination Report',    'Medical & Health',      'HALF_YEARLY', 'FACTORY',   true,  39),
('Occupational Health Checkup Report',        'Medical & Health',      'HALF_YEARLY', 'ALL',       false, 40);

-- ─── HALF YEARLY: Emergency Preparedness ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Fire Mock Drill Report',                    'Emergency Preparedness','HALF_YEARLY', 'ALL',       true,  41),
('Emergency Evacuation Drill Report',         'Emergency Preparedness','HALF_YEARLY', 'ALL',       true,  42),
('Disaster Management Drill Report',          'Emergency Preparedness','HALF_YEARLY', 'ALL',       false, 43);

-- ─── HALF YEARLY: Safety Review ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Hazard Identification & Risk Assessment Review','Safety Audits',     'HALF_YEARLY', 'ALL',       true,  44),
('Safety System Review Report',               'Safety Audits',         'HALF_YEARLY', 'ALL',       false, 45);

-- ─── ANNUAL: Fire Safety ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Fire Extinguisher Refilling Certificate',   'Statutory Safety Certificates','ANNUAL', 'ALL',     true,  46),
('Fire Safety NOC',                           'Statutory Safety Certificates','ANNUAL', 'ALL',     true,  47),
('Fire Alarm System Inspection Certificate',  'Statutory Safety Certificates','ANNUAL', 'ALL',     false, 48);

-- ─── ANNUAL: Electrical Safety ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Electrical Installation Inspection Certificate','Statutory Safety Certificates','ANNUAL','ALL',  true,  49),
('Earthing Test Certificate',                 'Statutory Safety Certificates','ANNUAL', 'ALL',     true,  50),
('Lightning Arrestor Test Certificate',       'Statutory Safety Certificates','ANNUAL', 'FACTORY', false, 51);

-- ─── ANNUAL: Equipment Certification ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Boiler Inspection Certificate',             'Statutory Safety Certificates','ANNUAL', 'FACTORY', false, 52),
('Lift / Elevator Inspection Certificate',    'Statutory Safety Certificates','ANNUAL', 'ALL',     false, 53),
('Pressure Vessel Certificate',               'Statutory Safety Certificates','ANNUAL', 'FACTORY', false, 54),
('Crane Load Test Certificate',               'Equipment Inspections', 'ANNUAL', 'FACTORY',       false, 55),
('Forklift Annual Inspection',                'Equipment Inspections', 'ANNUAL', 'FACTORY',       false, 56);

-- ─── ANNUAL: Statutory Safety Documents ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Safety Policy',                             'Statutory Safety Certificates','ANNUAL', 'ALL',     true,  57),
('Annual Safety Report',                      'Statutory Safety Certificates','ANNUAL', 'ALL',     true,  58),
('Annual Risk Assessment',                    'Safety Audits',         'ANNUAL', 'ALL',           true,  59),
('Safety Budget Plan',                        'Statutory Safety Certificates','ANNUAL', 'ALL',     false, 60);

-- ─── ANNUAL: Environmental Safety ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Pollution Control Consent Certificate',     'Environmental Safety',  'ANNUAL', 'FACTORY',       false, 61),
('Hazardous Waste Disposal Record',           'Environmental Safety',  'ANNUAL', 'FACTORY',       false, 62),
('Environmental Monitoring Report',           'Environmental Safety',  'ANNUAL', 'FACTORY',       false, 63);

-- ─── ANNUAL: Statutory Registers ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Health Register',                           'Statutory Safety Certificates','ANNUAL', 'FACTORY', true,  64),
('Accident Register (Annual Summary)',        'Incident Reports',      'ANNUAL', 'ALL',           true,  65),
('Safety Training Register',                  'Training & Awareness',  'ANNUAL', 'ALL',           true,  66);

-- ─── EVENT BASED: Incident & Emergency ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Accident Investigation Report',             'Event Based Incidents', 'EVENT_BASED', 'ALL',      true,  67),
('Fatal Accident Report',                     'Event Based Incidents', 'EVENT_BASED', 'ALL',      true,  68),
('Labour Department Intimation',              'Event Based Incidents', 'EVENT_BASED', 'ALL',      true,  69),
('Insurance Claim Documents',                 'Event Based Incidents', 'EVENT_BASED', 'ALL',      false, 70),
('Corrective Action Closure Report',          'Event Based Incidents', 'EVENT_BASED', 'ALL',      false, 71);

-- ─── FACTORY-SPECIFIC (AS_NEEDED / maintained continuously) ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('On-site Emergency Plan',                    'Emergency Preparedness','AS_NEEDED', 'FACTORY',    true,  72),
('Disaster Management Plan',                  'Emergency Preparedness','AS_NEEDED', 'FACTORY',    true,  73),
('Factory Safety Policy',                     'Statutory Safety Certificates','AS_NEEDED','FACTORY',true, 74),
('Hazardous Chemical Register',               'Environmental Safety',  'AS_NEEDED', 'FACTORY',    false, 75),
('Material Safety Data Sheets (MSDS)',        'Environmental Safety',  'AS_NEEDED', 'FACTORY',    false, 76),
('Lockout Tagout Procedure',                  'Safety Inspections',    'AS_NEEDED', 'FACTORY',    true,  77),
('Machine Operating SOP',                     'Safety Inspections',    'AS_NEEDED', 'FACTORY',    true,  78),
('Permit to Work System',                     'Safety Inspections',    'AS_NEEDED', 'FACTORY',    false, 79),
('Confined Space Entry Permit',               'Safety Inspections',    'AS_NEEDED', 'FACTORY',    false, 80),
('Hot Work Permit',                           'Safety Inspections',    'AS_NEEDED', 'FACTORY',    false, 81),
('PPE Issue Register',                        'Safety Inspections',    'AS_NEEDED', 'FACTORY',    true,  82),
('Safety Committee Formation Order',          'Safety Audits',         'AS_NEEDED', 'FACTORY',    true,  83);

-- ─── WAREHOUSE SAFETY ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Warehouse Safety Inspection Checklist',     'Safety Inspections',    'MONTHLY', 'WAREHOUSE',    true,  84),
('Storage Rack Inspection Report',            'Equipment Inspections', 'MONTHLY', 'WAREHOUSE',    true,  85),
('Forklift Safety Inspection',                'Equipment Inspections', 'MONTHLY', 'WAREHOUSE',    false, 86),
('Material Handling Safety Checklist',        'Safety Inspections',    'MONTHLY', 'WAREHOUSE',    true,  87),
('Warehouse Fire Safety Inspection',          'Safety Inspections',    'MONTHLY', 'WAREHOUSE',    true,  88);

-- ─── CONTRACTOR SAFETY ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Contractor Safety Induction Record',        'Training & Awareness',  'AS_NEEDED', 'ALL',        true,  89),
('Contractor Work Permit',                    'Safety Inspections',    'AS_NEEDED', 'ALL',        true,  90),
('Contractor PPE Compliance Report',          'Safety Inspections',    'AS_NEEDED', 'ALL',        false, 91),
('Contractor Incident Report',                'Incident Reports',      'AS_NEEDED', 'ALL',        false, 92),
('Contractor Safety Training Record',         'Training & Awareness',  'AS_NEEDED', 'ALL',        false, 93);

-- ─── SECURITY & ENTRY ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Visitor Entry Register',                    'Safety Inspections',    'MONTHLY', 'ALL',          false, 94),
('Vehicle Entry Register',                    'Safety Inspections',    'MONTHLY', 'ALL',          false, 95),
('Driver License Verification Record',        'Safety Inspections',    'MONTHLY', 'ALL',          false, 96),
('Helmet & PPE Compliance Register',          'Safety Inspections',    'MONTHLY', 'ALL',          false, 97);

-- ─── ESTABLISHMENT/OFFICE QUARTERLY ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Fire Drill Report',                         'Emergency Preparedness','QUARTERLY', 'ESTABLISHMENT',true, 98),
('Electrical Inspection Report',              'Safety Audits',         'QUARTERLY', 'ESTABLISHMENT',true, 99);

-- ─── ESTABLISHMENT/OFFICE ANNUAL ───
INSERT INTO safety_document_master (document_name, category, frequency, applicable_to, is_mandatory, sort_order) VALUES
('Fire Extinguisher Refilling Cert (Office)',  'Statutory Safety Certificates','ANNUAL','ESTABLISHMENT',true,100),
('Electrical Safety Certificate (Office)',     'Statutory Safety Certificates','ANNUAL','ESTABLISHMENT',true,101),
('Lift Inspection Certificate (Office)',       'Statutory Safety Certificates','ANNUAL','ESTABLISHMENT',false,102);

COMMENT ON TABLE safety_document_master IS 'Master list of 100+ safety document types with category, frequency, and applicability';
COMMENT ON COLUMN safety_documents.category IS 'Category: Safety Inspections, Incident Reports, Training & Awareness, Safety Audits, Equipment Inspections, Medical & Health, Emergency Preparedness, Statutory Safety Certificates, Environmental Safety, Event Based Incidents';
COMMENT ON COLUMN safety_documents.frequency IS 'MONTHLY, QUARTERLY, HALF_YEARLY, ANNUAL, EVENT_BASED, AS_NEEDED';
