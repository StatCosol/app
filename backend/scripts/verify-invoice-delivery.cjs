// Uses only a disposable localhost database. No SMTP calls or application DB settings.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
const { DataSource, EntitySchema } = require('typeorm');
const {
  InvoiceEmailLog,
} = require('../dist/src/accounts-billing/entities/invoice-email-log.entity');
const {
  InvoiceDeliveryService,
} = require('../dist/src/accounts-billing/services/invoice-delivery.service');
const config = {
  host: '127.0.0.1',
  port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
  user: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
  password: process.env.AUDITXPERT_TEST_PASSWORD,
  database: 'postgres',
};
const database = `invoice_delivery_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Client(config);
const col = (name, type = 'text') => ({ name, type, nullable: true });
const ds = new DataSource({
  ...config,
  username: config.user,
  database,
  type: 'postgres',
  entities: [
    new EntitySchema({
      name: 'InvoiceEmailLog',
      target: InvoiceEmailLog,
      tableName: 'invoice_email_logs',
      columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        invoiceId: col('invoice_id', 'uuid'),
        toEmail: col('to_email'),
        ccEmail: col('cc_email'),
        bccEmail: col('bcc_email'),
        subject: col('subject'),
        body: col('body'),
        sentStatus: col('sent_status'),
        sentBy: col('sent_by', 'uuid'),
        sentAt: col('sent_at', 'timestamptz'),
        failureReason: col('failure_reason'),
      },
    }),
  ],
});
let service = new InvoiceDeliveryService(ds);
const invoiceId = randomUUID();
const actor = { userId: randomUUID(), roleCode: 'ADMIN' };
const pdfPath = '/uploads/invoices/sample.pdf';
const requestId = randomUUID();
const fingerprint = service.fingerprint({ toEmail: 'sample@example.invalid' });
const input = {
  invoiceId,
  toEmail: 'sample@example.invalid',
  subject: 'Sample invoice',
  body: 'Sample body',
  sentStatus: 'NOT_SENT',
  sentBy: actor.userId,
};
const begin = (key = requestId, hash = fingerprint) =>
  service.begin(invoiceId, key, hash, input);
const job = async (id) =>
  (await ds.query('SELECT * FROM invoice_deliveries WHERE id=$1', [id]))[0];
const invoice = async () => (await ds.query('SELECT * FROM invoices'))[0];
const logs = () => ds.query('SELECT * FROM invoice_email_logs');
const sending = async () => {
  const { job } = await begin();
  await service.start(job, pdfPath, 'Sample invoice', 'Sample body');
  return job;
};
let passed = 0;
async function test(name, run) {
  await ds.query(
    'TRUNCATE invoice_deliveries,invoice_email_logs,invoices,invoice_audit_logs',
  );
  await ds.query("INSERT INTO invoices VALUES($1,$2,'APPROVED','NOT_SENT')", [
    invoiceId,
    pdfPath,
  ]);
  await run();
  passed++;
  console.log('PASS: ' + name);
}
async function main() {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  await ds.initialize();
  await ds.query(`CREATE TABLE invoices(id uuid PRIMARY KEY,pdf_path text,invoice_status text,mail_status text);
    CREATE TABLE invoice_email_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid,to_email text,cc_email text,bcc_email text,subject text,body text,sent_status text,sent_by uuid,sent_at timestamptz,failure_reason text);
    CREATE TABLE invoice_audit_logs(id uuid DEFAULT gen_random_uuid(),invoice_id uuid,action text,changed_by uuid,payload jsonb);`);
  const migration = readFileSync(
    join(__dirname, '../migrations/20260929_invoice_delivery_recovery.sql'),
    'utf8',
  );
  await ds.query(migration);
  await ds.query(migration);
  await test('one concurrent claimant and one durable log per request', async () => {
    const results = await Promise.all([begin(), begin()]);
    assert.equal(results.filter((r) => r.claimed).length, 1);
    assert.equal(results[0].job.id, results[1].job.id);
    assert.equal((await logs()).length, 1);
  });
  await test('different requests cannot overlap an unresolved send', async () => {
    await begin();
    await assert.rejects(begin(randomUUID()), /earlier delivery/);
    assert.equal((await logs()).length, 1);
  });
  await test('changed content cannot reuse an idempotency key', async () => {
    await begin();
    await assert.rejects(begin(requestId, 'different'), /changed/);
    await assert.rejects(
      service.existing(invoiceId, requestId, 'different'),
      /changed/,
    );
  });
  await test('cancelled invoice cannot reserve delivery', async () => {
    await ds.query("UPDATE invoices SET invoice_status='CANCELLED'");
    await assert.rejects(begin(), /Cancelled/);
    assert.equal((await logs()).length, 0);
  });
  await test('stale PDF and cancelled invoice cannot start SMTP', async () => {
    const { job } = await begin();
    await ds.query("UPDATE invoices SET pdf_path='/uploads/invoices/new.pdf'");
    await assert.rejects(
      service.start(job, pdfPath, 'subject', 'body'),
      /changed/,
    );
    await ds.query(
      "UPDATE invoices SET pdf_path=$1,invoice_status='CANCELLED'",
      [pdfPath],
    );
    await assert.rejects(
      service.start(job, pdfPath, 'subject', 'body'),
      /changed/,
    );
  });
  await test('abandoned preparation expires without permitting its old worker to send', async () => {
    const { job: saved } = await begin();
    await ds.query(
      "UPDATE invoice_deliveries SET updated_at=now()-interval '31 minutes'",
    );
    await service.recover();
    assert.equal((await job(saved.id)).status, 'NOT_SENT');
    await assert.rejects(
      service.start(saved, pdfPath, 'subject', 'body'),
      /expired/,
    );
    assert.equal((await begin(randomUUID())).claimed, true);
  });
  await test('failed preparation records a definite non-send', async () => {
    const { job: saved } = await begin();
    await service.preparationFailed(saved.id);
    assert.equal((await job(saved.id)).status, 'NOT_SENT');
    assert.equal((await logs())[0].sent_status, 'FAILED');
  });
  await test('accepted receipt reconciles log and invoice once', async () => {
    const saved = await sending();
    await service.accepted(saved.id, 'sample-message');
    await service.reconcile(saved.id);
    assert.equal((await job(saved.id)).status, 'RECONCILED');
    assert.equal((await invoice()).mail_status, 'SENT');
    assert.equal((await logs())[0].sent_status, 'SENT');
    assert.equal((await logs()).length, 1);
    assert.equal(
      service.result(await service.existing(invoiceId, requestId, fingerprint))
        .success,
      true,
    );
  });
  await test('receipt survives bookkeeping failure and a new service instance recovers it', async () => {
    const saved = await sending();
    await ds.query(`CREATE FUNCTION reject_log_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sample bookkeeping failure'; END $$;
      CREATE TRIGGER reject_log BEFORE UPDATE ON invoice_email_logs FOR EACH ROW EXECUTE FUNCTION reject_log_update();`);
    try {
      await assert.rejects(
        service.accepted(saved.id, 'durable-receipt'),
        /sample bookkeeping/,
      );
      assert.equal((await job(saved.id)).status, 'ACCEPTED');
      assert.equal((await invoice()).mail_status, 'NOT_SENT');
    } finally {
      await ds.query(
        'DROP TRIGGER reject_log ON invoice_email_logs; DROP FUNCTION reject_log_update()',
      );
    }
    await ds.destroy();
    await ds.initialize();
    service = new InvoiceDeliveryService(ds);
    await service.recover();
    assert.equal((await job(saved.id)).status, 'RECONCILED');
    assert.equal((await invoice()).mail_status, 'SENT');
  });
  await test('old receipt does not mark an edited invoice as sent', async () => {
    const saved = await sending();
    await ds.query('UPDATE invoices SET pdf_path=NULL');
    await service.accepted(saved.id, 'old-pdf');
    assert.equal((await logs())[0].sent_status, 'SENT');
    assert.equal((await invoice()).mail_status, 'NOT_SENT');
  });
  await test('crashed or ambiguous sends never get automatically resent or marked sent', async () => {
    const saved = await sending();
    await ds.query(
      "UPDATE invoice_deliveries SET updated_at=now()-interval '31 minutes'",
    );
    await service.recover();
    assert.equal((await job(saved.id)).status, 'UNKNOWN');
    await assert.rejects(begin(randomUUID()), /earlier delivery/);
    assert.equal((await invoice()).mail_status, 'NOT_SENT');
  });
  await test('returned failure is uncertain but disabled transport is definitely not sent', async () => {
    const saved = await sending();
    await service.uncertain(saved.id);
    assert.equal((await job(saved.id)).status, 'UNKNOWN');
    await service.resolve(
      actor,
      saved.id,
      'NOT_SENT',
      'Provider confirmed no queued or accepted message',
      true,
    );
    const next = await begin(randomUUID());
    await service.start(next.job, pdfPath, 'subject', 'body');
    await service.uncertain(next.job.id, true);
    assert.equal((await job(next.job.id)).status, 'NOT_SENT');
  });
  await test('only an administrator with verified provider evidence can resolve uncertainty', async () => {
    const saved = await sending();
    await service.uncertain(saved.id);
    for (const roleCode of ['ACCOUNTS', 'CLIENT', 'CRM', 'CEO'])
      await assert.rejects(
        service.resolve(
          { ...actor, roleCode },
          saved.id,
          'SENT',
          'Provider receipt confirmed',
          true,
        ),
        /Administrator/,
      );
    await assert.rejects(
      service.resolve(
        actor,
        saved.id,
        'SENT',
        'Provider receipt confirmed',
        false,
      ),
      /verified/,
    );
    await assert.rejects(
      service.resolve(actor, saved.id, 'SENT', 'short', true),
      /verified/,
    );
    await service.resolve(
      actor,
      saved.id,
      'SENT',
      'Provider receipt confirmed',
      true,
    );
    assert.equal((await job(saved.id)).status, 'RECONCILED');
    assert.equal((await invoice()).mail_status, 'SENT');
    assert.equal(
      (await ds.query('SELECT * FROM invoice_audit_logs')).length,
      1,
    );
    await assert.rejects(
      service.resolve(
        actor,
        saved.id,
        'NOT_SENT',
        'Provider no longer relevant',
        true,
      ),
      /Only uncertain/,
    );
  });
  await test('late uncertain callback cannot overwrite a persisted accepted receipt', async () => {
    const saved = await sending();
    await service.accepted(saved.id, 'accepted');
    await service.uncertain(saved.id);
    assert.equal((await logs())[0].sent_status, 'SENT');
    assert.equal((await job(saved.id)).status, 'RECONCILED');
  });
  await test('manual resolution rolls back completely if its audit evidence cannot be saved', async () => {
    const saved = await sending();
    await service.uncertain(saved.id);
    await ds.query(`CREATE FUNCTION reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sample evidence failure'; END $$;
      CREATE TRIGGER reject_evidence BEFORE INSERT ON invoice_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_evidence();`);
    try {
      await assert.rejects(
        service.resolve(
          actor,
          saved.id,
          'SENT',
          'Provider receipt confirmed',
          true,
        ),
        /sample evidence/,
      );
      assert.equal((await job(saved.id)).status, 'UNKNOWN');
      assert.equal((await job(saved.id)).resolution_note, null);
      assert.equal((await invoice()).mail_status, 'NOT_SENT');
      assert.equal((await logs())[0].sent_status, 'NOT_SENT');
    } finally {
      await ds.query(
        'DROP TRIGGER reject_evidence ON invoice_audit_logs; DROP FUNCTION reject_evidence()',
      );
    }
  });
  await test('delivery details do not expose fingerprint or attachment paths', async () => {
    const saved = await sending();
    const detail = (await service.details([saved.id]))[0];
    assert.equal(detail.status, 'SENDING');
    assert.equal('fingerprint' in detail, false);
    assert.equal('pdf_path' in detail, false);
  });
  console.log(`${passed} invoice delivery database checks passed.`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ds.isInitialized) await ds.destroy();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });
