const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const entities = require('../dist/src/accounts-billing/entities');
const { InvoiceStatus, InvoiceType, PaymentStatus, PaymentMode } = require('../dist/src/accounts-billing/enums');
const { InvoicesService } = require('../dist/src/accounts-billing/services/invoices.service');
const { InvoicePaymentsService } = require('../dist/src/accounts-billing/services/invoice-payments.service');
const { BillingCalculationService } = require('../dist/src/accounts-billing/services/billing-calculation.service');
const { BillingNumberService } = require('../dist/src/accounts-billing/services/billing-number.service');

async function main() {
  const db = new PGlite();
  let ds;
  try {
    await db.ready;
    ds = new DataSource({
      type: 'postgres', host: '127.0.0.1',
      port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
      username: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
      password: process.env.AUDITXPERT_TEST_PASSWORD,
      database: db.name, applicationName: 'billing-transaction-regression',
      // Only this helper-created disposable database is synchronized.
      synchronize: true,
      entities: [entities.Invoice, entities.InvoiceItem, entities.InvoicePayment,
        entities.InvoiceEmailLog, entities.InvoiceAuditLog, entities.BillingClient,
        entities.BillingSetting],
      extra: { options: '-c statement_timeout=10000 -c lock_timeout=8000' },
    });
    await ds.initialize();
    const repo = (entity) => ds.getRepository(entity);
    const invoices = (source = ds) => new InvoicesService(
      repo(entities.Invoice), repo(entities.InvoiceItem), repo(entities.BillingClient),
      repo(entities.BillingSetting), repo(entities.InvoiceAuditLog),
      new BillingCalculationService(),
      new BillingNumberService(repo(entities.Invoice), repo(entities.BillingSetting)), source,
    );
    const payments = (source = ds) => new InvoicePaymentsService(
      repo(entities.Invoice), repo(entities.InvoicePayment), source,
    );
    const userId = randomUUID();
    const client = await repo(entities.BillingClient).save({
      tenantId: randomUUID(), billingCode: 'SYNTHETIC', legalName: 'Synthetic billing client',
      billingEmail: 'billing@example.invalid', stateCode: '36', stateName: 'Telangana',
      billingAddress: 'Test address',
    });
    let sequence = 0;
    async function seed(status = InvoiceStatus.APPROVED) {
      return repo(entities.Invoice).save({
        tenantId: client.tenantId, billingClientId: client.id,
        invoiceType: InvoiceType.TAX_INVOICE, invoiceNumber: `TEST/${++sequence}`,
        invoiceDate: '2026-09-27', financialYear: '2026-27', createdBy: userId,
        invoiceStatus: status, paymentStatus: PaymentStatus.UNPAID,
        grandTotal: 100, balanceOutstanding: 100,
        items: [{ serviceDescription: 'Original item', quantity: 1, rate: 100,
          amount: 100, taxableAmount: 100, lineTotal: 100 }],
      });
    }
    const edit = { items: [{ serviceDescription: 'Replacement item', quantity: 1, rate: 200, gstRate: 0 }] };
    const payment = { paymentDate: '2026-09-27', amountReceived: 40, paymentMode: PaymentMode.BANK_TRANSFER };
    const record = (service, id, amount = 40) => service.recordPayment(id, { ...payment, amountReceived: amount }, userId);
    const read = (id) => invoices().findOne(id);
    const outcome = (promise) => promise.then(value => ({ value }), error => ({ error }));

    // Keep the first real service transaction open after its writes. Confirm
    // PostgreSQL actually blocked the second request before allowing commit.
    async function overlap(first, second) {
      let ready, release;
      const arrived = new Promise(resolve => { ready = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const heldSource = { transaction: callback => ds.transaction(async manager => {
        const value = await callback(manager);
        ready();
        await gate;
        return value;
      }) };
      const firstResult = outcome(first(heldSource));
      let secondResult;
      try {
        await Promise.race([arrived, firstResult.then(result => {
          throw result.error || new Error('First request completed before gate');
        })]);
        secondResult = outcome(second());
        let blocked = false;
        for (let attempt = 0; attempt < 250; attempt++) {
          const result = await db.query(`SELECT 1 FROM pg_stat_activity
            WHERE datname = $1 AND application_name = 'billing-transaction-regression'
              AND wait_event_type = 'Lock'`, [db.name]);
          if (result.rows.length) { blocked = true; break; }
          await delay(20);
        }
        assert.ok(blocked, 'Second request must wait on the first transaction');
      } finally {
        release();
        await firstResult;
        if (secondResult) await secondResult;
      }
      assert.ifError((await firstResult).error);
      return secondResult;
    }

    for (const operation of ['edit', 'cancel']) {
      const invoice = await seed();
      const second = await overlap(
        source => record(payments(source), invoice.id),
        () => operation === 'edit' ? invoices().update(invoice.id, edit, userId) : invoices().cancel(invoice.id),
      );
      assert.equal(second.error?.status, 400);
      const saved = await read(invoice.id);
      assert.equal(saved.invoiceStatus, InvoiceStatus.PARTIALLY_PAID);
      assert.equal(Number(saved.amountReceived), 40);
      assert.equal(Number(saved.balanceOutstanding), 60);
      assert.equal(saved.items[0].serviceDescription, 'Original item');
      assert.equal(saved.payments.length, 1);
    }

    for (const amount of [40, 100]) {
      const invoice = await seed();
      const result = await overlap(
        source => record(payments(source), invoice.id, amount),
        () => invoices().updatePdfPath(invoice.id, 'synthetic.pdf'),
      );
      assert.ifError(result.error);
      const saved = await read(invoice.id);
      assert.equal(saved.invoiceStatus, amount === 100 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID);
      assert.equal(saved.pdfPath, 'synthetic.pdf');
      assert.equal(Number(saved.amountReceived), amount);
    }

    for (const operation of ['payment', 'approve', 'pdf']) {
      const invoice = await seed(operation === 'approve' ? InvoiceStatus.DRAFT : InvoiceStatus.APPROVED);
      const result = await overlap(
        source => invoices(source).cancel(invoice.id),
        () => operation === 'payment' ? record(payments(), invoice.id)
          : operation === 'approve' ? invoices().approve(invoice.id, userId)
            : invoices().updatePdfPath(invoice.id, 'cancelled.pdf'),
      );
      if (operation === 'pdf') assert.ifError(result.error);
      else assert.equal(result.error?.status, 400);
      const saved = await read(invoice.id);
      assert.equal(saved.invoiceStatus, InvoiceStatus.CANCELLED);
      assert.equal(Number(saved.amountReceived), 0);
      assert.equal(saved.payments.length, 0);
    }

    {
      const invoice = await seed();
      const result = await overlap(
        source => invoices(source).update(invoice.id, edit, userId),
        () => record(payments(), invoice.id, 150),
      );
      assert.ifError(result.error);
      const saved = await read(invoice.id);
      assert.equal(Number(saved.grandTotal), 200);
      assert.equal(Number(saved.amountReceived), 150);
      assert.equal(Number(saved.balanceOutstanding), 50);
      assert.equal(saved.items.length, 1);
      assert.equal(saved.items[0].serviceDescription, 'Replacement item');
      assert.equal(await repo(entities.InvoiceAuditLog).countBy({ invoiceId: invoice.id }), 1);
    }
    {
      const invoice = await seed(InvoiceStatus.DRAFT);
      const result = await overlap(
        source => invoices(source).approve(invoice.id, userId),
        () => invoices().approve(invoice.id, randomUUID()),
      );
      assert.equal(result.error?.status, 400);
      assert.equal((await read(invoice.id)).approvedBy, userId);
    }
    {
      const invoice = await seed();
      const before = await read(invoice.id);
      await db.exec("ALTER TABLE invoice_audit_logs ADD CONSTRAINT reject_test_edit CHECK (action <> 'EDIT') NOT VALID");
      try {
        await assert.rejects(invoices().update(invoice.id, edit, userId), error => error.code === '23514');
        assert.deepEqual(await read(invoice.id), before, 'Audit failure must roll back totals and item replacement');
      } finally {
        await db.exec('ALTER TABLE invoice_audit_logs DROP CONSTRAINT reject_test_edit');
      }
      await assert.rejects(invoices().update(invoice.id, {
        items: [{ ...edit.items[0], serviceDescription: null }],
      }, userId), error => error.code === '23502');
      assert.deepEqual(await read(invoice.id), before, 'Item save failure must restore deleted originals');
      assert.equal(await repo(entities.InvoiceAuditLog).countBy({ invoiceId: invoice.id }), 0);
    }
    console.log('PASS: 9 overlapping billing operations and 2 failure rollbacks on disposable PostgreSQL using real TypeORM repositories.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
