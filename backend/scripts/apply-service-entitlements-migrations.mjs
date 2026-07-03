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
  '20260703_mobile_attendance_device_soft_delete_compat.sql',
  '20260704_mobile_attendance_liveness_nonce_compat.sql',
  '20260704_mobile_attendance_enrollment_history_compat.sql',
  '20260704_mobile_attendance_enrollment_history_actor_fk_compat.sql',
  // FnF (PR #382): reason widen must run before the exited-employee backfill,
  // so files are applied in declared order, not alphabetical.
  '20260703_fnf_manual_override.sql',
  '20260703_auto_fnf_on_exit.sql',
  '20260703_button_endpoint_db_alignment.sql',
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

async function verifyMobileAttendanceDeviceCompat() {
  const { rows: tableRows } = await client.query(`
    SELECT to_regclass('public.mobile_attendance_devices') AS reg
  `);
  if (!tableRows[0]?.reg) {
    console.log('mobile_attendance_devices not present; device compatibility verification skipped.');
    return;
  }

  const { rows } = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'mobile_attendance_devices'
       AND column_name IN ('deleted_at', 'deletedAt', 'created_at', 'createdAt', 'registered_at', 'registeredAt')
  `);
  const columns = new Set(rows.map((row) => row.column_name));
  if (!columns.has('deleted_at') && !columns.has('deletedAt')) {
    throw new Error('mobile_attendance_devices missing deleted_at/deletedAt soft-delete column');
  }
  if (
    !columns.has('created_at') &&
    !columns.has('createdAt') &&
    !columns.has('registered_at') &&
    !columns.has('registeredAt')
  ) {
    throw new Error('mobile_attendance_devices missing created/registered timestamp column');
  }
  console.log('Verified mobile_attendance_devices soft-delete compatibility.');
}

async function verifyMobileAttendanceLivenessNonceCompat() {
  const { rows: tableRows } = await client.query(`
    SELECT to_regclass('public.face_liveness_nonces') AS reg
  `);
  if (!tableRows[0]?.reg) {
    console.log('face_liveness_nonces not present; liveness nonce compatibility verification skipped.');
    return;
  }

  const { rows } = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'face_liveness_nonces'
       AND column_name IN ('employee_id', 'contractor_employee_id', 'subject_id', 'client_id', 'branch_id')
       AND is_nullable = 'NO'
  `);
  if (rows.length > 0) {
    throw new Error(
      `face_liveness_nonces legacy columns still NOT NULL: ${rows
        .map((row) => row.column_name)
        .join(', ')}`,
    );
  }
  console.log('Verified face_liveness_nonces liveness challenge compatibility.');
}

async function verifyMobileAttendanceEnrollmentHistoryCompat() {
  const { rows: tableRows } = await client.query(`
    SELECT to_regclass('public.face_enrollment_history') AS reg
  `);
  if (!tableRows[0]?.reg) {
    console.log('face_enrollment_history not present; enrollment history compatibility verification skipped.');
    return;
  }

  const requiredColumns = [
    'contractor_employee_id',
    'reason',
    'embedding_model',
    'actor_user_id',
    'created_at',
  ];
  const { rows } = await client.query(
    `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'face_enrollment_history'
       AND column_name = ANY($1::text[])
    `,
    [requiredColumns],
  );
  const found = new Set(rows.map((row) => row.column_name));
  const missing = requiredColumns.filter((column) => !found.has(column));
  if (missing.length > 0) {
    throw new Error(
      `face_enrollment_history missing current columns: ${missing.join(', ')}`,
    );
  }
  const { rows: actorFkRows } = await client.query(`
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att
        ON att.attrelid = rel.oid
       AND att.attnum = ANY(con.conkey)
     WHERE nsp.nspname = 'public'
       AND rel.relname = 'face_enrollment_history'
       AND con.contype = 'f'
       AND att.attname = 'actor_user_id'
  `);
  if (actorFkRows.length > 0) {
    throw new Error(
      `face_enrollment_history actor_user_id still has foreign keys: ${actorFkRows
        .map((row) => row.conname)
        .join(', ')}`,
    );
  }
  console.log('Verified face_enrollment_history kiosk enrollment compatibility.');
}

try {
  console.log('=== Apply service entitlement migrations ===');
  console.log(`Database: ${config.database} @ ${config.host}:${config.port}`);
  await client.connect();
  await ensureMigrationTable();

  const presentFiles = new Set(await readdir(migrationsDir));
  const missing = [...serviceMigrationFiles].filter(
    (filename) => !presentFiles.has(filename),
  );
  if (missing.length > 0) {
    throw new Error(`missing migration files: ${missing.join(', ')}`);
  }

  // Apply in declared order (dependencies may not sort alphabetically).
  for (const filename of serviceMigrationFiles) {
    await applyMigration(filename);
  }

  await verifyTables();
  await verifyMobileAttendanceDeviceCompat();
  await verifyMobileAttendanceLivenessNonceCompat();
  await verifyMobileAttendanceEnrollmentHistoryCompat();
  console.log('Service entitlement migrations are up to date.');
} catch (err) {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
} finally {
  await client.end();
}
