/* Opt-in isolated PostgreSQL smoke test. Never loads application .env files. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
require('ts-node/register/transpile-only');
const {
  StatutoryAuditEntryService,
} = require('../src/audits/statutory-audit-entry.service');
const {
  ENTRY_CATEGORIES,
} = require('../src/audits/statutory-audit-entry.catalogue');

async function main() {
  const url = process.env.AUDIT_ENTRY_TEST_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error(
      'Set AUDIT_ENTRY_TEST_URL to an isolated local PostgreSQL instance',
    );
  const db = new Client({ connectionString: url });
  await db.connect();
  const schema = `audit_entry_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET search_path TO ${schema},public`);
    // Parent fixtures isolate this feature from unrelated application migrations.
    await db.query(`CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE audits(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, assigned_auditor_id uuid, contractor_user_id uuid, audit_type text DEFAULT 'FACTORY', status text DEFAULT 'PLANNED', score numeric, score_calculated_at timestamptz, submitted_at timestamptz, final_remark text);
      CREATE TABLE audit_reports(id uuid PRIMARY KEY, audit_id uuid REFERENCES audits(id), status text, held_at timestamptz, updated_at timestamptz DEFAULT now());
      CREATE TABLE audit_checklist_items(audit_id uuid REFERENCES audits(id),status text, automated_remarks text,automation_reviewed boolean DEFAULT false);
      CREATE TABLE audit_non_compliances(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, audit_id uuid REFERENCES audits(id), document_name varchar(512), remark text, requested_to_role text, requested_to_user_id uuid, status text);`);
    const migration = fs.readFileSync(
      path.join(__dirname, '../migrations/20261104_statutory_audit_entry.sql'),
      'utf8',
    );
    await db.query(migration);
    await db.query(migration); // Idempotent schema application.
    const auditor = { userId: randomUUID(), roleCode: 'AUDITOR' };
    const auditee = {
      userId: randomUUID(),
      roleCode: 'CLIENT',
      clientId: randomUUID(),
    };
    await db.query('INSERT INTO users VALUES($1),($2)', [
      auditor.userId,
      auditee.userId,
    ]);
    const em = {
      query: async (sql, values) => (await db.query(sql, values)).rows,
      findOne: async (_entity, options) =>
        (
          await db.query(
            `SELECT id,client_id AS "clientId",branch_id AS "branchId",assigned_auditor_id AS "assignedAuditorId",contractor_user_id AS "contractorUserId",audit_type AS "auditType",status FROM audits WHERE id=$1${options.lock ? ' FOR UPDATE' : ''}`,
            [options.where.id],
          )
        ).rows[0],
      findOneByOrFail: async (entity, where) => em.findOne(entity, { where }),
      update: async (_entity, id, values) => {
        const columns = {
          status: 'status',
          score: 'score',
          scoreCalculatedAt: 'score_calculated_at',
          submittedAt: 'submitted_at',
          finalRemark: 'final_remark',
        };
        const entries = Object.entries(values);
        assert(entries.every(([key]) => columns[key]));
        await db.query(
          `UPDATE audits SET ${entries.map(([key], i) => `${columns[key]}=$${i + 2}`).join(',')} WHERE id=$1`,
          [id, ...entries.map(([, value]) => value)],
        );
      },
    };
    const ds = {
      manager: em,
      query: em.query,
      transaction: async (fn) => {
        await db.query('BEGIN');
        try {
          const result = await fn(em);
          await db.query('COMMIT');
          return result;
        } catch (e) {
          await db.query('ROLLBACK');
          throw e;
        }
      },
    };
    const service = new StatutoryAuditEntryService(ds, {
      getScope: async () => ({ level: 'client', clientId: auditee.clientId }),
    });
    const category = [...ENTRY_CATEGORIES].sort(
      (a, b) => a.items.length - b.items.length,
    )[0];
    const first = category.items[0];
    for (const mode of ['PHYSICAL', 'ONLINE']) {
      const id = randomUUID();
      await db.query(
        'INSERT INTO audits(id,client_id,assigned_auditor_id) VALUES($1,$2,$3)',
        [id, auditee.clientId, auditor.userId],
      );
      await service.configure(auditor, id, {
        unitType: 'FACTORY',
        auditMode: mode,
        auditeeName: 'Test auditee',
        categories: [category.name],
        scopeAcknowledged: true,
      });
      await assert.rejects(
        () =>
          db.query("UPDATE audits SET status='SUBMITTED' WHERE id=$1", [id]),
        /Submit the statutory checklist/,
      );
      await assert.rejects(
        () =>
          db.query(
            "INSERT INTO audit_reports(id,audit_id,status) VALUES($1,$2,'SUBMITTED')",
            [randomUUID(), id],
          ),
        /Submit the statutory checklist/,
      );
      for (const point of category.items.slice(1))
        await service.save(auditor, id, point.id, {
          answer: 'Outside operations',
          status: 'NOT_APPLICABLE',
          remarks: 'Not applicable to this test unit',
          version: 0,
        });
      if (mode === 'ONLINE') {
        await assert.rejects(
          () =>
            service.save(auditor, id, first.id, {
              answer: 'Checked',
              status: 'COMPLIED',
              remarks: '',
              version: 0,
            }),
          /approved auditee document/,
        );
        const file = {
          originalname: 'support.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7\nTest fixture'),
        };
        const doc = await service.auditeeUpload(auditee, id, first.id, file);
        assert.equal(doc.revision, 1);
        await service.reviewDocument(auditor, id, doc.id, {
          status: 'APPROVED',
          remarks: 'Verified',
          version: 0,
        });
        await service.save(auditor, id, first.id, {
          answer: 'Checked',
          status: 'COMPLIED',
          remarks: '',
          version: 0,
        });
        const next = await service.auditeeUpload(auditee, id, first.id, file);
        assert.equal(next.revision, 2);
        assert.equal(
          (await service.read(auditor, id)).answers.find(
            (a) => a.item_id === first.id,
          ).stale,
          true,
        );
        await assert.rejects(
          () => service.submit(auditor, id),
          /Review the auditee document/,
        );
        await service.reviewDocument(auditor, id, next.id, {
          status: 'REJECTED',
          remarks: 'Supply a signed copy',
          version: 0,
        });
        await service.save(auditor, id, first.id, {
          answer: 'Unsigned',
          status: 'NON_COMPLIED',
          remarks: 'Required signed evidence missing',
          version: 1,
        });
        assert.deepEqual(
          (await service.documentFile(auditee, id, doc.id)).content,
          file.buffer,
        );
        assert.equal(
          (await service.auditeeRead(auditee, id)).documents[0].revision,
          2,
        );
      } else {
        await service.save(auditor, id, first.id, {
          answer: 'Inspected onsite',
          status: 'COMPLIED',
          remarks: '',
          version: 0,
        });
      }
      await db.query(
        "INSERT INTO audit_checklist_items(audit_id,status) VALUES($1,'PENDING')",
        [id],
      );
      await assert.rejects(
        () => service.submit(auditor, id),
        /existing workspace checklist/,
      );
      assert.equal(
        (
          await db.query(
            'SELECT submitted_at FROM audit_entry_sessions WHERE audit_id=$1',
            [id],
          )
        ).rows[0].submitted_at,
        null,
      );
      await db.query(
        "UPDATE audit_checklist_items SET status='NOT_APPLICABLE' WHERE audit_id=$1",
        [id],
      );
      const result = await service.submit(auditor, id);
      assert.equal(
        result.status,
        mode === 'ONLINE' ? 'CORRECTION_PENDING' : 'SUBMITTED',
      );
      assert.equal(result.score, mode === 'ONLINE' ? 0 : 100);
      await assert.rejects(() => service.submit(auditor, id), /read-only/);
      if (mode === 'ONLINE') {
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int AS n FROM audit_non_compliances WHERE audit_id=$1',
              [id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal((await service.auditeeRead(auditee, id)).readonly, true);
      }
      console.log(
        `${mode}: scope, saves, submission and immutable results passed`,
      );
    }
    console.log(
      'PostgreSQL migration and document revision/review lifecycle passed',
    );
  } finally {
    await db.query('ROLLBACK');
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
