#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');
loadEnv({ path: join(__dirname, '..', '.env') });

const serviceMigrationFiles = new Set([
  '20260627_client_service_entitlements.sql',
  '20260628_client_module_pending_request_unique.sql',
  '20260628b_client_service_entitlement_checks.sql',
  '20260628c_client_service_jsonb_array_checks.sql',
  '20260628d_client_service_jsonb_module_checks.sql',
  '20260628e_client_service_review_state_checks.sql',
  '20260628f_client_service_review_note_checks.sql',
  '20260628g_client_service_approval_metadata_checks.sql',
  '20260628h_client_service_audit_note_checks.sql',
  '20260628i_client_service_nonempty_module_checks.sql',
  '20260629_mobile_attendance_devices_created_at_compat.sql',
]);

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'statcompy',
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true' ||
    process.env.DB_SSL_CA_PATH
      ? { rejectUnauthorized: false }
      : undefined,
};

const client = new pg.Client(config);

async function ensureMigrationTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sql_migrations (
      filename        TEXT PRIMARY KEY,
      checksum_sha256 TEXT NOT NULL,
      applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_mode  VARCHAR(20) NOT NULL DEFAULT 'apply'
    );
  `);
}

async function applyMigration(filename) {
  const filePath = join(migrationsDir, filename);
  const content = await readFile(filePath);
  const checksum = createHash('sha256').update(content).digest('hex');

  const existing = await client.query(
    'SELECT checksum_sha256 FROM sql_migrations WHERE filename = $1',
    [filename],
  );

  if (existing.rows.length > 0) {
    const recorded = String(existing.rows[0].checksum_sha256 || '').trim();
    if (recorded && recorded !== checksum) {
      throw new Error(`checksum drift for ${filename}`);
    }
    console.log(`SKIP: ${filename}`);
    return;
  }

  console.log(`APPLY: ${filename}`);
  await client.query('BEGIN');
  try {
    await client.query(content.toString('utf8'));
    await client.query(
      `INSERT INTO sql_migrations (filename, checksum_sha256, execution_mode)
       VALUES ($1, $2, 'apply')`,
      [filename, checksum],
    );
    await client.query('COMMIT');
    console.log(`OK: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function verifyTables() {
  const { rows } = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'client_module_change_requests',
         'client_service_packages',
         'client_module_entitlements',
         'client_module_audit_logs'
       )
     ORDER BY table_name
  `);
  const found = rows.map((row) => row.table_name);
  if (found.length !== 4) {
    throw new Error(`service entitlement tables missing: ${found.join(', ')}`);
  }
  console.log(`Verified tables: ${found.join(', ')}`);
}

try {
  console.log('=== Apply service entitlement migrations ===');
  console.log(`Database: ${config.database} @ ${config.host}:${config.port}`);
  await client.connect();
  await ensureMigrationTable();

  const availableFiles = (await readdir(migrationsDir))
    .filter((filename) => serviceMigrationFiles.has(filename))
    .sort((a, b) => a.localeCompare(b));

  if (availableFiles.length !== serviceMigrationFiles.size) {
    const missing = [...serviceMigrationFiles].filter(
      (filename) => !availableFiles.includes(filename),
    );
    throw new Error(`missing migration files: ${missing.join(', ')}`);
  }

  for (const filename of availableFiles) {
    await applyMigration(filename);
  }

  await verifyTables();
  console.log('Service entitlement migrations are up to date.');
} catch (err) {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
} finally {
  await client.end();
}
