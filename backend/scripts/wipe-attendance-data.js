const { Client } = require('pg');

const execute = process.argv.includes('--execute');

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
};

const tables = [
  ['comp_off_ledger', 'DELETE FROM comp_off_ledger'],
  ['contractor_biometric_punches', 'DELETE FROM contractor_biometric_punches'],
  ['biometric_punches', 'DELETE FROM biometric_punches'],
  ['attendance_records', 'DELETE FROM attendance_records'],
];

async function tableExists(client, table) {
  const res = await client.query('SELECT to_regclass($1) AS name', [table]);
  return Boolean(res.rows[0]?.name);
}

async function countRows(client, table) {
  if (!(await tableExists(client, table))) return null;
  const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return res.rows[0]?.count ?? 0;
}

async function main() {
  for (const key of ['host', 'user', 'password', 'database']) {
    if (!config[key]) throw new Error(`Missing DB ${key}`);
  }

  const client = new Client(config);
  await client.connect();

  try {
    console.log('Before:');
    for (const [table] of tables) {
      const count = await countRows(client, table);
      console.log(`${table}: ${count === null ? 'skipped' : count}`);
    }

    if (!execute) {
      console.log('\nDry run only. Re-run with --execute to delete attendance data.');
      return;
    }

    await client.query('BEGIN');
    const results = [];
    try {
      for (const [table, sql] of tables) {
        if (!(await tableExists(client, table))) {
          results.push([table, 'skipped']);
          continue;
        }
        const res = await client.query(sql);
        results.push([table, res.rowCount || 0]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log('\nDeleted:');
    for (const [table, count] of results) {
      console.log(`${table}: ${count}`);
    }

    console.log('\nAfter:');
    for (const [table] of tables) {
      const count = await countRows(client, table);
      console.log(`${table}: ${count === null ? 'skipped' : count}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
