-- Migration: Seed standard observation categories
-- Date: 2026-06-15
-- Purpose: Add compliance-domain observation categories for audit NCs

BEGIN;

INSERT INTO audit_observation_categories (name, description) VALUES
  ('Registrations',                   'Registration certificates and renewals under applicable labour laws'),
  ('Licenses',                        'Licenses required under Shops & Establishments, Factories Act, etc.'),
  ('Labour Law Records',              'Statutory registers, muster rolls, wage registers, and attendance records'),
  ('Returns & Filings',               'Periodic statutory returns and filings (PF, ESI, LWF, PT, etc.)'),
  ('Wage & Payroll Records',          'Payslips, wage sheets, bonus records, gratuity provisions'),
  ('Safety Records',                  'Safety committee minutes, fire drill records, safety audits, PPE logs'),
  ('Welfare Records',                 'Welfare facility records — canteen, crèche, first aid, washrooms'),
  ('Contractor Compliance',           'CLRA compliance: contractor licences, workmen registers, wage payments'),
  ('Factory Specific Documents',      'Factory plan approvals, stability certificates, pollution consents'),
  ('POSH / Policy / Committee Records', 'Internal Complaints Committee records, policies, and training logs'),
  ('Inspection & Notice Closures',    'Government inspection reports, show-cause replies, and closure proofs')
ON CONFLICT (name) DO NOTHING;

COMMIT;
