const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
process.env.TS_NODE_PROJECT = path.join(root, 'tsconfig.json');
require('ts-node/register/transpile-only');
const { DataSource } = require('typeorm');
const {
  ContractorEmployeesService,
} = require('../src/contractor/contractor-employees/contractor-employees.service');
const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: true,
          ...(process.env.DB_SSL_CA_PATH
            ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') }
            : {}),
        }
      : false,
  extra: { connectionTimeoutMillis: 15000 },
  synchronize: false,
});
(async () => {
  await ds.initialize();
  const before = await ds.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE employee_code IS NULL OR btrim(employee_code) = '')::int AS missing FROM contractor_employees`,
  );
  console.log(
    JSON.stringify({
      mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
      ...before[0],
    }),
  );
  if (!process.argv.includes('--apply')) return;
  const clients = await ds.query(
    `SELECT DISTINCT client_id FROM contractor_employees WHERE employee_code IS NULL OR btrim(employee_code) = '' ORDER BY client_id`,
  );
  const svc = new ContractorEmployeesService(null, null, null, null, ds, null);
  let assigned = 0;
  for (const { client_id } of clients) {
    for (;;) {
      const result = await svc.backfillEmployeeCodes(client_id, 200);
      assigned += result.coded;
      if (result.remaining === 0) break;
      if (result.coded === 0)
        throw new Error('No progress; stopped with records remaining');
    }
  }
  const [after] = await ds.query(
    `SELECT count(*) FILTER (WHERE employee_code IS NULL OR btrim(employee_code) = '')::int AS missing FROM contractor_employees`,
  );
  console.log(JSON.stringify({ assigned, remaining: after.missing }));
})()
  .catch((e) => {
    console.error(e.code || e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ds.isInitialized) await ds.destroy();
  });
