/**
 * One-time cleanup: delete all audit documents, schedules, and related data
 * so audits can be rescheduled fresh.
 *
 * Run from inside the backend container:
 *   node scripts/cleanup-audit-data.mjs
 *
 * Deletion order (respects FK constraints / CASCADE):
 *   1. ai_audit_observations  (no CASCADE from audits, must go first)
 *   2. contractor_documents   WHERE audit_id IS NOT NULL  (no FK, just a column)
 *   3. DELETE FROM audits     → cascades: audit_observations, audit_checklist_items,
 *                                audit_reports, audit_document_reviews,
 *                                audit_non_compliances, audit_resubmissions
 *   4. audit_schedules        (independent automation table)
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('Connected to DB:', process.env.DB_HOST, '/', process.env.DB_NAME);

  // ── Show counts before deletion ──────────────────────────────────────────
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM audits)                                          AS audits,
      (SELECT COUNT(*) FROM audit_schedules)                                 AS audit_schedules,
      (SELECT COUNT(*) FROM audit_observations)                              AS audit_observations,
      (SELECT COUNT(*) FROM audit_checklist_items)                           AS audit_checklist_items,
      (SELECT COUNT(*) FROM audit_document_reviews)                          AS audit_document_reviews,
      (SELECT COUNT(*) FROM audit_non_compliances)                           AS audit_non_compliances,
      (SELECT COUNT(*) FROM audit_resubmissions)                             AS audit_resubmissions,
      (SELECT COUNT(*) FROM ai_audit_observations)                           AS ai_audit_observations,
      (SELECT COUNT(*) FROM contractor_documents WHERE audit_id IS NOT NULL) AS contractor_docs_linked
  `);
  console.log('\n--- COUNTS BEFORE DELETION ---');
  console.table(counts.rows[0]);

  // ── 1. ai_audit_observations (no cascade from audits) ───────────────────
  const r1 = await client.query('DELETE FROM ai_audit_observations WHERE audit_id IN (SELECT id FROM audits)');
  console.log(`\nDeleted ai_audit_observations: ${r1.rowCount}`);

  // ── 2. contractor_documents linked to audits ────────────────────────────
  const r2 = await client.query('DELETE FROM contractor_documents WHERE audit_id IS NOT NULL');
  console.log(`Deleted contractor_documents (audit-linked): ${r2.rowCount}`);

  // ── 3. audits (CASCADE: reviews, NCs, resubmissions, observations, checklists, reports) ──
  const r3 = await client.query('DELETE FROM audits');
  console.log(`Deleted audits: ${r3.rowCount} (cascade cleaned child tables)`);

  // ── 4. audit_schedules ──────────────────────────────────────────────────
  const r4 = await client.query('DELETE FROM audit_schedules');
  console.log(`Deleted audit_schedules: ${r4.rowCount}`);

  // ── Verify all clear ────────────────────────────────────────────────────
  const after = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM audits)                                          AS audits,
      (SELECT COUNT(*) FROM audit_schedules)                                 AS audit_schedules,
      (SELECT COUNT(*) FROM audit_observations)                              AS audit_observations,
      (SELECT COUNT(*) FROM audit_checklist_items)                           AS audit_checklist_items,
      (SELECT COUNT(*) FROM audit_document_reviews)                          AS audit_document_reviews,
      (SELECT COUNT(*) FROM audit_non_compliances)                           AS audit_non_compliances,
      (SELECT COUNT(*) FROM audit_resubmissions)                             AS audit_resubmissions,
      (SELECT COUNT(*) FROM ai_audit_observations)                           AS ai_audit_observations,
      (SELECT COUNT(*) FROM contractor_documents WHERE audit_id IS NOT NULL) AS contractor_docs_linked
  `);
  console.log('\n--- COUNTS AFTER DELETION ---');
  console.table(after.rows[0]);
  console.log('\nDone. All audit data cleared.');
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => client.end());
