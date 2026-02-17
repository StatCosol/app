-- Seed provided users with hashed password Statco@123 (bcrypt)
WITH data(email, name, role_id, user_code, password_hash) AS (
  VALUES
    ('slvmgmtconsultants@gmail.com','SLV CRM','ff8a300d-36eb-4d85-8a23-c393f8107211'::uuid,'CRM001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW'),
    ('compliance@statcosol.com','CCO Compliance','0695af64-6f13-4c84-a4c4-2e16be182575'::uuid,'CCO001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW'),
    ('srisai@gmail.com','Contractor User','50abc4b6-d7ae-4bb4-8653-956b5c61cee6'::uuid,'CONT001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW'),
    ('payroll_audit@statcosol.com','Payroll Auditor','64be90e4-a865-46b2-9338-60fe58b93a8d'::uuid,'AUD001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW'),
    ('sravan@vedhaentch.com','Client User','43550595-9962-4ec3-9382-4c5a6efdd2d0'::uuid,'CLIENT001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW'),
    ('madan.kallepalli@gmail.com','Payroll User','d4bc87e4-33c0-4974-bfa0-bc3161a08506'::uuid,'PAY001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW'),
    ('mkkallepalli@gmail.com','CEO User','e4939774-4b4a-4e85-b440-b4b021cd48a7'::uuid,'CEO001','$2b$10$oUECOEpd78UtYgvSnkX8l.jqFLX0JxghfZeefvDWKVykTl0E03kbW')
)
INSERT INTO users (user_code, name, email, password_hash, role_id, is_active, client_id, owner_cco_id)
SELECT user_code, name, email, password_hash, role_id, true, NULL, NULL
FROM data
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role_id = EXCLUDED.role_id,
      is_active = true,
      deleted_at = NULL,
      user_code = EXCLUDED.user_code;
