
import dataSource from '../src/typeorm.datasource';

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


-- Insert ADMIN user
INSERT INTO users (role_id, user_code, name, email, mobile, password_hash)
SELECT
  r.id,
  'SSA-1',
  'Statco Admin',
  'admin@statcosol.com',
  '9581003537',
  crypt('Admin@123', gen_salt('bf'))
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
  crypt('Statco@123', gen_salt('bf'))
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
