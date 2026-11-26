/*
 * One-off repair: re-run branch compliance applicability for every active
 * branch with the fixed ComplianceApplicabilityService (PR #870), so existing
 * branches lose the wrong Factories Act / S&E entries.
 *
 * Usage (after `npm run build`):
 *   node scripts/recompute-branch-compliance.cjs            # dry run, rolls back
 *   node scripts/recompute-branch-compliance.cjs --apply    # backup + commit
 *
 * Safety:
 * - Only existing AUTO rows are updated. Inserts of rows a branch never had are
 *   skipped and only counted, so this corrects data without adding work.
 * - Manual overrides are never touched (the service already skips them).
 * - With --apply, branch_compliances is first copied to
 *   branch_compliances_backup_<UTC stamp> in the same database.
 * - Everything runs in one transaction; a dry run always rolls back.
 * - Output is aggregate counts and compliance names only, never client or
 *   branch identifiers, because Actions logs on this repository are public.
 *
 * Connection: DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, DB_SSL=true.
 */
require('reflect-metadata');
const path = require('node:path');
const fs = require('node:fs');
const { DataSource } = require('typeorm');
const { ComplianceApplicabilityService } = require('../dist/src/compliances/compliance-applicability.service');
const { BranchEntity } = require('../dist/src/branches/entities/branch.entity');

const apply = process.argv.includes('--apply');

async function snapshot(q) {
  const rows = await q(
    `SELECT bc.branch_id, bc.compliance_id, bc.is_applicable, cm.compliance_name
       FROM branch_compliances bc LEFT JOIN compliance_master cm ON cm.id = bc.compliance_id`,
  );
  return new Map(rows.map((r) => [`${r.branch_id}|${r.compliance_id}`, r]));
}

async function main() {
  for (const k of ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'])
    if (!process.env[k]) throw new Error(`${k} is required`);
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    synchronize: false,
    entities: [path.join(__dirname, '../dist/src/**/*.entity.js')],
  });
  await ds.initialize();
  const summary = [];
  try {
    if (apply) {
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const backup = `branch_compliances_backup_${stamp}`;
      await ds.query(`CREATE TABLE "${backup}" AS TABLE branch_compliances`);
      const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM "${backup}"`);
      summary.push(`Backup table: ${backup} (${n} rows)`);
    }

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const q = (sql, params) => qr.query(sql, params);
      const before = await snapshot(q);
      let skippedInserts = 0;
      // Same DataSource surface the service uses, bound to this transaction.
      const txDs = {
        getRepository: (entity) => qr.manager.getRepository(entity),
        query: async (sql, params) => {
          if (/^\s*INSERT INTO branch_compliances/i.test(sql)) {
            skippedInserts++;
            return [];
          }
          return q(sql, params);
        },
      };
      const service = new ComplianceApplicabilityService(txDs);
      const branches = await qr.manager
        .getRepository(BranchEntity)
        .find({ where: { isActive: true, isDeleted: false }, select: { id: true } });

      let failed = 0;
      for (const b of branches) {
        await qr.query('SAVEPOINT branch_recompute');
        try {
          await service.recomputeForBranch(b.id);
          await qr.query('RELEASE SAVEPOINT branch_recompute');
        } catch (e) {
          failed++;
          await qr.query('ROLLBACK TO SAVEPOINT branch_recompute');
          console.error(`branch recompute failed: ${e.message}`);
        }
      }

      const after = await snapshot(q);
      const changedBranches = new Set();
      const flips = new Map();
      for (const [key, row] of after) {
        const old = before.get(key);
        if (old && old.is_applicable !== row.is_applicable) {
          changedBranches.add(row.branch_id);
          const label = `${row.compliance_name ?? row.compliance_id}: ${old.is_applicable ? 'applicable' : 'not applicable'} -> ${row.is_applicable ? 'applicable' : 'not applicable'}`;
          flips.set(label, (flips.get(label) ?? 0) + 1);
        }
      }

      summary.push(
        `Mode: ${apply ? 'APPLY (committed)' : 'DRY RUN (rolled back)'}`,
        `Active branches checked: ${branches.length} (failed: ${failed})`,
        `Branches whose applicability changed: ${changedBranches.size}`,
        `Rows changed: ${[...flips.values()].reduce((a, b) => a + b, 0)}`,
        `Missing rows not inserted (left as is): ${skippedInserts}`,
        '',
        'Changes by compliance:',
        ...[...flips.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v} branch(es)`),
      );

      if (apply && failed === 0) await qr.commitTransaction();
      else {
        if (apply) summary.push('', 'Not committed because some branches failed.');
        await qr.rollbackTransaction();
      }
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  } finally {
    await ds.destroy();
  }
  const text = summary.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Branch compliance recompute\n\n\`\`\`\n${text}\n\`\`\`\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
