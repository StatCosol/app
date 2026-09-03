#!/usr/bin/env node
/**
 * Remove FaceDesk V2 operational data only — enrollments, punches, reports,
 * review queue, audit trail. Does NOT touch ESS / legacy mobile-attendance:
 *   face_enrollments, mobile_attendance_*, contractor_face_enrollments, etc.
 *
 * Keeps by default:
 *   facedesk_kiosk_devices, facedesk_face_settings (portal thresholds + mode)
 *
 * Usage:
 *   node scripts/reset-facedesk-v2-data.mjs
 *   node scripts/reset-facedesk-v2-data.mjs --execute
 *   node scripts/reset-facedesk-v2-data.mjs --execute --client-id <uuid>
 *   node scripts/reset-facedesk-v2-data.mjs --execute --include-devices
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env') });

const execute = process.argv.includes('--execute');
const includeDevices = process.argv.includes('--include-devices');
const clientArg = process.argv.find((a) => a.startsWith('--client-id='));
const clientId = clientArg
  ? clientArg.slice('--client-id='.length)
  : process.argv.includes('--client-id')
    ? process.argv[process.argv.indexOf('--client-id') + 1]
    : null;

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'statcompy',
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});

const FACEDESK_TABLES = [
  'facedesk_attendance_review_queue',
  'facedesk_manual_attendance_corrections',
  'facedesk_attendance_logs',
  'facedesk_attendance_failed_attempts',
  'facedesk_face_duplicate_alerts',
  'facedesk_enroll_tickets',
  'facedesk_device_sync_logs',
  'facedesk_day_reviews',
  'facedesk_audit_logs',
  'facedesk_employee_face_profiles',
];

const ESS_TABLES = [
  'face_enrollments',
  'face_enrollment_history',
  'face_enrollment_templates',
  'face_reenrollment_requests',
  'mobile_attendance_punches',
  'mobile_attendance_devices',
  'contractor_face_enrollments',
  'contractor_face_reenrollment_requests',
];

function where(clientId) {
  return clientId ? ' WHERE client_id = $1::uuid' : '';
}

async function countTable(table, clientId) {
  const exists = await client.query(`SELECT to_regclass($1) AS name`, [table]);
  if (!exists.rows[0]?.name) return null;
  if (table === 'facedesk_employee_face_samples' && clientId) {
    const res = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM facedesk_employee_face_samples s
         JOIN facedesk_employee_face_profiles p ON p.profile_id = s.profile_id
        WHERE p.client_id = $1::uuid`,
      [clientId],
    );
    return res.rows[0].n;
  }
  const sql = clientId
    ? `SELECT COUNT(*)::int AS n FROM ${table} WHERE client_id = $1::uuid`
    : `SELECT COUNT(*)::int AS n FROM ${table}`;
  const res = await client.query(sql, clientId ? [clientId] : []);
  return res.rows[0].n;
}

async function main() {
  await client.connect();
  console.log(
    `Connected: ${process.env.DB_HOST}/${process.env.DB_NAME}` +
      (clientId ? ` (client ${clientId})` : ' (all clients)'),
  );

  console.log('\n--- FaceDesk V2 (will delete) ---');
  for (const t of FACEDESK_TABLES) {
    const n = await countTable(t, clientId);
    console.log(`${t}: ${n === null ? 'missing' : n}`);
  }
  const sampleCount = await countTable('facedesk_employee_face_samples', clientId);
  console.log(
    `facedesk_employee_face_samples: ${sampleCount === null ? 'missing' : sampleCount} (cascade via profiles)`,
  );
  if (includeDevices) {
    const n = await countTable('facedesk_kiosk_devices', clientId);
    console.log(`facedesk_kiosk_devices: ${n === null ? 'missing' : n} (will delete)`);
  } else {
    const n = await countTable('facedesk_kiosk_devices', clientId);
    console.log(`facedesk_kiosk_devices: ${n === null ? 'missing' : n} (kept)`);
  }
  const settings = await countTable('facedesk_face_settings', clientId);
  console.log(`facedesk_face_settings: ${settings === null ? 'missing' : settings} (kept)`);

  console.log('\n--- ESS / legacy (must stay untouched) ---');
  for (const t of ESS_TABLES) {
    const n = await countTable(t, clientId);
    console.log(`${t}: ${n === null ? 'missing' : n}`);
  }

  if (!execute) {
    console.log(
      '\nDry run only. Re-run with --execute to delete FaceDesk V2 data.',
    );
    await client.end();
    return;
  }

  const w = where(clientId);
  const params = clientId ? [clientId] : [];

  const deletes = [
    ['facedesk_attendance_review_queue', `DELETE FROM facedesk_attendance_review_queue${w}`],
    [
      'facedesk_manual_attendance_corrections',
      `DELETE FROM facedesk_manual_attendance_corrections${w}`,
    ],
    ['facedesk_attendance_logs', `DELETE FROM facedesk_attendance_logs${w}`],
    [
      'facedesk_attendance_failed_attempts',
      `DELETE FROM facedesk_attendance_failed_attempts${w}`,
    ],
    ['facedesk_face_duplicate_alerts', `DELETE FROM facedesk_face_duplicate_alerts${w}`],
    ['facedesk_enroll_tickets', `DELETE FROM facedesk_enroll_tickets${w}`],
    ['facedesk_device_sync_logs', `DELETE FROM facedesk_device_sync_logs${w}`],
    ['facedesk_day_reviews', `DELETE FROM facedesk_day_reviews${w}`],
    ['facedesk_audit_logs', `DELETE FROM facedesk_audit_logs${w}`],
    ['facedesk_employee_face_profiles', `DELETE FROM facedesk_employee_face_profiles${w}`],
  ];

  if (includeDevices) {
    deletes.push(['facedesk_kiosk_devices', `DELETE FROM facedesk_kiosk_devices${w}`]);
  }

  await client.query('BEGIN');
  try {
    for (const [label, sql] of deletes) {
      const exists = await client.query(`SELECT to_regclass($1) AS name`, [label]);
      if (!exists.rows[0]?.name) {
        console.log(`${label}: skipped (table missing)`);
        continue;
      }
      const res = await client.query(sql, params);
      console.log(`${label}: deleted ${res.rowCount ?? 0}`);
    }
    await client.query('COMMIT');
    console.log('\nDone. ESS / legacy tables were not modified.');
    console.log(
      'Note: Azure Large Face List entries are NOT removed by this script — run Admin → Azure Face Sync after re-enrollment if needed.',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
