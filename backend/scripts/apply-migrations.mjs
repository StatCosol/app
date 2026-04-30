#!/usr/bin/env node
/**
 * Cross-platform SQL migration runner (Node.js).
 * Replaces the PowerShell-only apply-all-migrations.ps1 for use
 * in Docker, Linux CI/CD, VPS, or any environment without PowerShell.
 *
 * Usage:
 *   node scripts/apply-migrations.mjs                     # apply pending
 *   node scripts/apply-migrations.mjs --bootstrap         # record applied without running
 *   node scripts/apply-migrations.mjs --include-legacy     # include legacy seeds
 *
 * Environment variables (with defaults):
 *   DB_HOST=localhost  DB_PORT=5432  DB_USER=postgres
 *   DB_PASS=<empty>    DB_NAME=statcompy
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

const args = process.argv.slice(2);
const bootstrap = args.includes('--bootstrap');
const includeLegacy = args.includes('--include-legacy');

const EXCLUDED_FILES = new Set([
  '20260208_seed_compliance_tasks.sql',
  '20260306_sprint1_v2_seed.sql',
]);
const BASELINE_FILE = 'statco_schema_final.sql';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'statcompy',
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
};

console.log('=== StatCo: Apply Active SQL Migrations (Node) ===');
console.log(`Database: ${config.database} @ ${config.host}:${config.port}`);
console.log(`User: ${config.user}`);
if (bootstrap) console.log('Mode: bootstrap existing database into migration tracking');

const client = new pg.Client(config);

try {
  await client.connect();

  // Ensure tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS sql_migrations (
      filename        TEXT PRIMARY KEY,
      checksum_sha256 TEXT NOT NULL,
      applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_mode  VARCHAR(20) NOT NULL DEFAULT 'apply'
    );
  `);

  // Collect active migration files
  const allFiles = await readdir(migrationsDir);
  let activeFiles = allFiles
    .filter((f) => /^(\d{8}|025)_.*\.sql$/.test(f) || f === BASELINE_FILE)
    .filter((f) => !EXCLUDED_FILES.has(f));

  if (!includeLegacy) {
    activeFiles = activeFiles.filter((f) => !EXCLUDED_FILES.has(f));
  }
  activeFiles.sort((a, b) => {
    if (a === BASELINE_FILE) return -1;
    if (b === BASELINE_FILE) return 1;
    return a.localeCompare(b);
  });

  if (activeFiles.length === 0) {
    console.log('No active migration files found.');
    process.exit(0);
  }

  console.log(`Processing ${activeFiles.length} migration files...\n`);

  let applied = 0;
  let bootstrapped = 0;
  let skipped = 0;
  const failed = [];

  for (const filename of activeFiles) {
    const filePath = join(migrationsDir, filename);
    const content = await readFile(filePath);
    const hash = createHash('sha256').update(content).digest('hex');

    // Check if already tracked
    const { rows } = await client.query(
      'SELECT checksum_sha256 FROM sql_migrations WHERE filename = $1',
      [filename],
    );

    if (rows.length > 0) {
      const existing = rows[0].checksum_sha256?.trim();
      if (existing && existing !== hash) {
        console.log(`\x1b[31mFAIL: checksum drift for ${filename}\x1b[0m`);
        failed.push(`${filename} :: checksum drift (recorded ${existing}, current ${hash})`);
        continue;
      }
      console.log(`\x1b[33mSKIP: ${filename}\x1b[0m`);
      skipped++;
      continue;
    }

    if (bootstrap) {
      console.log(`BOOTSTRAP: ${filename}`);
      await client.query(
        `INSERT INTO sql_migrations (filename, checksum_sha256, execution_mode)
         VALUES ($1, $2, 'bootstrap')`,
        [filename, hash],
      );
      bootstrapped++;
      continue;
    }

    // Apply the migration inside a transaction
    console.log(`APPLY: ${filename}`);
    const sql = content.toString('utf-8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO sql_migrations (filename, checksum_sha256, execution_mode)
         VALUES ($1, $2, 'apply')`,
        [filename, hash],
      );
      await client.query('COMMIT');
      console.log(`\x1b[32mOK: ${filename}\x1b[0m`);
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log(`\x1b[31mFAIL: ${filename} — ${err.message}\x1b[0m`);
      failed.push(filename);
    }
  }

  console.log('');
  console.log(`\x1b[32mApplied: ${applied}\x1b[0m`);
  console.log(`\x1b[36mBootstrapped: ${bootstrapped}\x1b[0m`);
  console.log(`\x1b[33mSkipped: ${skipped}\x1b[0m`);

  if (failed.length > 0) {
    console.log(`\x1b[31mFailed: ${failed.length}\x1b[0m`);
    for (const f of failed) console.log(`  - ${f}`);
    process.exit(2);
  }

  console.log('\x1b[36mSQL migration tracking is up to date.\x1b[0m');
} catch (err) {
  console.error(`Connection error: ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}
