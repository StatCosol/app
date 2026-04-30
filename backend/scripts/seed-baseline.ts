import dataSource from '../src/typeorm.datasource';

const sqlEscape = (value: string) => value.replace(/'/g, "''");

const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? 'it_admin@statcosol.com';
const adminPassword =
  process.env.DEFAULT_SEED_PASSWORD ??
  process.env.SMOKE_ADMIN_PASSWORD;
const ceoPassword = process.env.SEED_CEO_PASSWORD ?? 'Statco@123';

if (!adminPassword) {
  throw new Error(
    'DEFAULT_SEED_PASSWORD or SMOKE_ADMIN_PASSWORD must be set before seeding baseline users.',
  );
}

const seedSql = `
-- Clean minimal seed for roles and admin user
BEGIN;

INSERT INTO roles (code, name)
VALUES
 ('ADMIN','Admin'),
 ('CEO','CEO'),
 ('CCO','CCO'),
 ('CRM','CRM'),
 ('AUDITOR','Auditor'),
 ('CLIENT','Client'),
 ('CONTRACTOR','Contractor')
ON CONFLICT DO NOTHING;

-- Insert one baseline client so payroll/admin smoke can resolve at least one client
INSERT INTO clients (client_code, client_name, status, is_active)
VALUES
 ('SMKBASE', 'Smoke Baseline Client', 'ACTIVE', true)
ON CONFLICT (client_code) DO NOTHING;


-- Insert ADMIN user
INSERT INTO users (role_id, user_code, name, email, mobile, password_hash)
SELECT
  r.id,
  'SSA-1',
  'Statco Admin',
  '${sqlEscape(adminEmail)}',
  '9581003537',
  crypt('${sqlEscape(adminPassword)}', gen_salt('bf'))
FROM roles r WHERE r.code='ADMIN'
ON CONFLICT DO NOTHING;

-- Insert CEO user
INSERT INTO users (role_id, user_code, name, email, mobile, password_hash)
SELECT
  r.id,
  'SCEO-1',
  'Ram kumar',
  'mkkallepalli@gmail.com',
  '9014291142',
  crypt('${sqlEscape(ceoPassword)}', gen_salt('bf'))
FROM roles r WHERE r.code='CEO'
ON CONFLICT DO NOTHING;

COMMIT;
`;

async function run() {
  const ds = dataSource;
  await ds.initialize();
  try {
    await ds.query(seedSql);
    console.log('Seeded baseline roles + system users');
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('Seeding failed', err);
  process.exit(1);
});
