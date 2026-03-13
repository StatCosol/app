-- Seed roles only. Admin user will be auto-created by UsersService.seedAdminIfMissing() at app boot.
INSERT INTO roles (id, code, name, is_system)
VALUES
  (gen_random_uuid(), 'ADMIN', 'System Admin', true),
  (gen_random_uuid(), 'CEO', 'Chief Executive Officer', true),
  (gen_random_uuid(), 'CCO', 'Chief Compliance Officer', true),
  (gen_random_uuid(), 'CRM', 'Compliance Relationship Manager', true),
  (gen_random_uuid(), 'AUDITOR', 'AuditXpert Auditor', true),
  (gen_random_uuid(), 'CLIENT', 'LegitX Client User', true),
  (gen_random_uuid(), 'CONTRACTOR', 'Contractor', true)
ON CONFLICT (code) DO NOTHING;
