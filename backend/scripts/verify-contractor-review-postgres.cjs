/* Real source-controller SQL against temporary PostgreSQL tables. Local test DB only.
 * Sequential execution-order checks, not two-session lock timing or full upload HTTP.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const connectionString = process.env.CONTRACTOR_REVIEW_TEST_URL;
if (!connectionString)
  throw new Error('CONTRACTOR_REVIEW_TEST_URL is required');
const target = new URL(connectionString);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/^\/(statcompy_ci|contractor_review_test)$/.test(target.pathname)
) {
  throw new Error(
    'Only a localhost isolated statcompy_ci or contractor_review_test database is allowed',
  );
}
require('ts-node').register({
  project: path.join(__dirname, '../tsconfig.json'),
  transpileOnly: true,
});
const {
  CrmContractorDocumentsController,
} = require('../src/crm/crm-contractor-documents.controller');
const { Client } = require('pg');
const client = new Client({ connectionString });
const passed = [];
(async () => {
  await client.connect();
  try {
    for (const statusType of ['contractor_document_status', 'varchar(30)']) {
      await client.query('BEGIN');
      await client.query(`CREATE TYPE pg_temp.contractor_document_status AS ENUM ('UPLOADED','PENDING_REVIEW','APPROVED','REJECTED','EXPIRED'); SET LOCAL search_path=pg_temp,public;
      CREATE TEMP TABLE clients(id text PRIMARY KEY);
      CREATE TEMP TABLE client_assignments_current(client_id text,assigned_to_user_id text,assignment_type text);
      CREATE TEMP TABLE contractor_documents(id text PRIMARY KEY,client_id text,file_path text,status ${statusType},review_notes text,reviewed_by_user_id text,reviewed_at timestamptz);
      INSERT INTO clients VALUES('TEST-CLIENT');
      INSERT INTO client_assignments_current VALUES('TEST-CLIENT','TEST-CRM','CRM');`);
      const controller = new CrmContractorDocumentsController({
        many: async (sql, params) => (await client.query(sql, params)).rows,
      });
      const user = { id: 'TEST-CRM' };
      const body = {
        status: 'APPROVED',
        expectedFilePath: 'TEST-ONLY-original.pdf',
        expectedStatus: 'REJECTED',
        expectedReviewedAt: '2026-11-14T00:00:00.123456Z',
      };
      const reset = () =>
        client.query(`DELETE FROM contractor_documents;
      INSERT INTO contractor_documents VALUES('TEST-DOC','TEST-CLIENT','TEST-ONLY-original.pdf','REJECTED','TEST ONLY previous rejection','TEST-CRM','2026-11-14T00:00:00.123456Z');`);
      await reset();
      await client.query(
        `UPDATE contractor_documents SET file_path='TEST-ONLY-corrected.pdf',status='PENDING_REVIEW',reviewed_at=NULL WHERE id='TEST-DOC'`,
      );
      await assert.rejects(
        controller.review(user, 'TEST-DOC', body),
        /changed/,
      );
      assert.equal(
        (await client.query('SELECT status FROM contractor_documents')).rows[0]
          .status,
        'PENDING_REVIEW',
      );
      passed.push(
        statusType + ': replacement-first leaves corrected evidence pending',
      );
      await reset();
      await controller.review(user, 'TEST-DOC', body);
      // Equivalent rejected-file snapshot guard; the full upload service is tested in Jest.
      const replacement = await client.query(
        `UPDATE contractor_documents SET file_path='TEST-ONLY-corrected.pdf',status='PENDING_REVIEW',reviewed_at=NULL
      WHERE id='TEST-DOC' AND status='REJECTED' AND file_path=$1 AND reviewed_at=$2 RETURNING id`,
        [body.expectedFilePath, body.expectedReviewedAt],
      );
      assert.equal(replacement.rowCount, 0);
      passed.push(
        statusType + ': review-first prevents stale rejected-file replacement',
      );
      await reset();
      await controller.review(user, 'TEST-DOC', body);
      await assert.rejects(
        controller.review(user, 'TEST-DOC', { ...body, status: 'REJECTED' }),
        /changed/,
      );
      passed.push(statusType + ': repeated review snapshot rejected');
      await reset();
      const timestamp = (
        await client.query(
          `SELECT to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS value FROM contractor_documents`,
        )
      ).rows[0].value;
      assert.equal(timestamp, body.expectedReviewedAt);
      await controller.review(user, 'TEST-DOC', {
        ...body,
        expectedReviewedAt: timestamp,
      });
      passed.push(statusType + ': microsecond timestamp roundtrip preserved');
      await reset();
      let listSql;
      const listController = new CrmContractorDocumentsController({
        many: async (sql) => {
          listSql = sql;
          return [];
        },
      });
      await listController.list(user, { status: 'REJECTED' });
      const statusPredicate = listSql
        .match(/cd\.status::text\s*=\s*\$5::text/)[0]
        .replace('$5', '$1');
      const filtered = await client.query(
        `SELECT id FROM contractor_documents cd WHERE ${statusPredicate}`,
        ['REJECTED'],
      );
      assert.equal(filtered.rowCount, 1);
      passed.push(
        statusType + ': source list status predicate supports schema',
      );
      await reset();
      await client.query('DELETE FROM client_assignments_current');
      await assert.rejects(
        controller.review(user, 'TEST-DOC', body),
        /not in your scope/,
      );
      passed.push(statusType + ': unassigned CRM denied');
      await client.query('ROLLBACK');
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
  console.log(JSON.stringify({ passed, rolledBack: true }));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
