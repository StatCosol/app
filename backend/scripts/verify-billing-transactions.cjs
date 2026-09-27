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
const { BillingReportsService } = require('../dist/src/accounts-billing/services/billing-reports.service');

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

    const createDto = {
      billingClientId: client.id, invoiceType: InvoiceType.TAX_INVOICE,
      invoiceDate: '2026-09-27', items: edit.items,
    };
    const convertDto = { purchaseOrderNumber: 'SYNTHETIC-PO', invoiceDate: '2026-09-27' };
    async function concurrentNumbers(first, second) {
      let savedFirst;
      const result = await overlap(
        async source => { savedFirst = await first(invoices(source)); return savedFirst; }, second,
      );
      assert.ifError(result.error);
      assert.notEqual(savedFirst.invoiceNumber, result.value.invoiceNumber);
      assert.notEqual(savedFirst.id, result.value.id);
      assert.equal(Number(result.value.invoiceNumber.split('/').at(-1)),
        Number(savedFirst.invoiceNumber.split('/').at(-1)) + 1);
      return [savedFirst, result.value];
    }
    const manualPair = await concurrentNumbers(
      service => service.create(createDto, userId), () => invoices().create(createDto, userId),
    );
    assert.deepEqual(manualPair.map(row => row.invoiceNumber), ['STSINV/2627/0001', 'STSINV/2627/0002']);

    const proforma = await invoices().create({ ...createDto, invoiceType: InvoiceType.PROFORMA }, userId);
    const conversionPair = await concurrentNumbers(
      service => service.convertProformaToTaxInvoice(proforma.id, convertDto, userId),
      () => invoices().create(createDto, userId),
    );
    assert.equal(conversionPair[0].convertedFromProformaId, proforma.id);
    const [p2, p3] = await Promise.all([1, 2].map(() => invoices().create({
      ...createDto, invoiceType: InvoiceType.PROFORMA,
    }, userId)));
    await concurrentNumbers(
      service => service.convertProformaToTaxInvoice(p2.id, convertDto, userId),
      () => invoices().convertProformaToTaxInvoice(p3.id, convertDto, userId),
    );

    await concurrentNumbers(
      service => service.create(createDto, userId, randomUUID()),
      () => invoices().create(createDto, userId),
    );
    const recurringId = randomUUID();
    let recurring;
    const retry = await overlap(
      async source => { recurring = await invoices(source).create(createDto, userId, recurringId); return recurring; },
      () => invoices().create({ ...createDto, items: [{ ...edit.items[0], rate: 999 }] }, userId, recurringId),
    );
    assert.ifError(retry.error);
    assert.equal(retry.value.id, recurringId);
    assert.equal(retry.value.invoiceNumber, recurring.invoiceNumber);
    assert.equal(Number(retry.value.grandTotal), 200);
    assert.equal(retry.value.items.length, 1);
    await invoices().approve(recurringId, userId);
    await record(payments(), recurringId, 200);
    const paidRecurring = await read(recurringId);
    await invoices().create(createDto, userId, recurringId);
    assert.deepEqual(await read(recurringId), paidRecurring, 'Recurring retry must preserve paid invoice and items');
    await assert.rejects(invoices().create({ ...createDto, billingClientId: randomUUID() }, userId, recurringId),
      error => error.status === 400 && /client mismatch/.test(error.message));

    const settings = await repo(entities.BillingSetting).save({
      tenantId: client.tenantId, legalName: 'Synthetic supplier', gstin: '', pan: '',
      address: 'Test only', stateCode: '36', stateName: 'Telangana',
      invoicePrefix: 'S-T/S', proformaPrefix: 'STS',
    });
    const shared = await concurrentNumbers(
      service => service.create(createDto, userId),
      () => invoices().create({ ...createDto, invoiceType: InvoiceType.PROFORMA }, userId),
    );
    assert.deepEqual(shared.map(row => row.invoiceNumber), ['STS/2627/0001', 'STS/2627/0002']);

    async function setPrefix(prefix) { await repo(entities.BillingSetting).update(settings.id, { invoicePrefix: prefix }); }
    async function seedNumber(invoiceNumber) {
      const row = await seed();
      await repo(entities.Invoice).update(row.id, { invoiceNumber });
      return row.id;
    }
    await setPrefix('LEG');
    const legacyNumbers = ['LEG/2627/9', 'LEG/2627/0010', 'LEG/2627/9999-DRAFT', 'LEG/2627/not-a-sequence'];
    const legacyIds = [];
    for (const number of legacyNumbers) legacyIds.push(await seedNumber(number));
    assert.equal((await invoices().create(createDto, userId)).invoiceNumber, 'LEG/2627/0011');
    for (let i = 0; i < legacyIds.length; i++) assert.equal((await read(legacyIds[i])).invoiceNumber, legacyNumbers[i]);

    await setPrefix('FAIL');
    const beforeCount = await repo(entities.Invoice).count();
    const beforeItems = await repo(entities.InvoiceItem).count();
    await assert.rejects(invoices().create({ ...createDto, items: [{ ...edit.items[0], serviceDescription: null }] }, userId),
      error => error.code === '23502');
    assert.equal(await repo(entities.Invoice).count(), beforeCount);
    assert.equal(await repo(entities.InvoiceItem).count(), beforeItems);
    assert.equal((await invoices().create(createDto, userId)).invoiceNumber, 'FAIL/2627/0001');

    await setPrefix('CAP');
    await seedNumber('CAP/2627/9998');
    assert.equal((await invoices().create({ ...createDto, invoiceDate: '2027-03-31' }, userId)).invoiceNumber, 'CAP/2627/9999');
    const cappedCount = await repo(entities.Invoice).count();
    await assert.rejects(invoices().create(createDto, userId), error => error.status === 400 && /exceeded 9999/.test(error.message));
    assert.equal(await repo(entities.Invoice).count(), cappedCount);
    assert.equal((await invoices().create({ ...createDto, invoiceDate: '2027-04-01' }, userId)).invoiceNumber, 'CAP/2728/0001');
    await setPrefix('BIG');
    await seedNumber('BIG/2627/9999999999999999999999999999999999999999');
    await assert.rejects(invoices().create(createDto, userId), error => error.status === 400 && /exceeded 9999/.test(error.message));
    console.log('PASS: 6 controlled numbering races, recurring retry preservation, numeric legacy ordering, creation rollback, sequence exhaustion and financial-year rollover.');

    const reports = new BillingReportsService(repo(entities.Invoice));
    const dashboardBefore = await invoices().getDashboardStats();
    const reportClient = await repo(entities.BillingClient).save({
      tenantId: client.tenantId, billingCode: 'REPORT', legalName: 'Synthetic Report Client',
      billingEmail: 'report@example.invalid', stateCode: '36', stateName: 'Telangana', billingAddress: 'Test only',
    });
    const reportRows = [];
    for (const [status, type, total, received] of [
      [InvoiceStatus.APPROVED, InvoiceType.TAX_INVOICE, 100, 0],
      [InvoiceStatus.PARTIALLY_PAID, InvoiceType.TAX_INVOICE, 200, 50],
      [InvoiceStatus.PAID, InvoiceType.TAX_INVOICE, 300, 300],
      [InvoiceStatus.OVERDUE, InvoiceType.TAX_INVOICE, 400, 0],
      [InvoiceStatus.DRAFT, InvoiceType.TAX_INVOICE, 500, 0],
      [InvoiceStatus.CANCELLED, InvoiceType.TAX_INVOICE, 600, 0],
      [InvoiceStatus.GENERATED, InvoiceType.PROFORMA, 700, 0],
      [InvoiceStatus.GENERATED, InvoiceType.CREDIT_NOTE, 800, 0],
      [InvoiceStatus.APPROVED, InvoiceType.TAX_INVOICE, 0, 0],
    ]) {
      const paymentStatus = received === 0 ? PaymentStatus.UNPAID
        : received === total ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
      reportRows.push(await repo(entities.Invoice).save({
        tenantId: client.tenantId, billingClientId: reportClient.id, createdBy: userId,
        invoiceNumber: `REPORT/${reportRows.length + 1}`, invoiceType: type, invoiceStatus: status,
        invoiceDate: '2026-09-27', financialYear: '2026-27', dueDate: '2026-09-01',
        grandTotal: total, taxableValue: total, amountReceived: received, balanceOutstanding: total - received,
        paymentStatus,
        items: [1, 2].map(sequence => ({ serviceDescription: `Sample ${sequence}`, sequence,
          quantity: 1, rate: total / 2, amount: total / 2, taxableAmount: total / 2, lineTotal: total / 2 })),
      }));
    }
    const dashboardAfter = await invoices().getDashboardStats();
    for (const [key, expected] of Object.entries({
      totalInvoices: 9, draftCount: 1, approvedCount: 2, pendingPaymentCount: 3,
      paidCount: 1, overdueCount: 1, totalBilled: 1000, totalReceived: 350, totalOutstanding: 650,
    })) assert.equal(Number(dashboardAfter[key]) - Number(dashboardBefore[key]), expected, key);

    const reportQuery = { clientId: reportClient.id, fromDate: '2026-09-27', toDate: '2026-09-27' };
    const summary = await reports.getReport({ ...reportQuery, reportType: 'CLIENT_SUMMARY' });
    assert.equal(summary.rows.length, 1);
    assert.equal(summary.summary.invoiceCount, 5);
    assert.equal(summary.summary.billedAmount, 1000);
    assert.equal(summary.summary.receivedAmount, 350);
    assert.equal(summary.summary.outstandingAmount, 650);
    assert.equal(summary.rows[0].invoiceCount, 5, 'Item joins must not duplicate invoices');
    assert.equal(summary.rows[0].billedAmount, 1000);
    const outstanding = await reports.getReport({ ...reportQuery, reportType: 'OUTSTANDING' });
    assert.equal(outstanding.rows.length, 3);
    assert.equal(outstanding.summary.outstandingAmount, 650);
    const paid = await reports.getReport({ ...reportQuery, reportType: 'PAID' });
    assert.equal(paid.rows.length, 1);
    assert.equal(paid.summary.receivedAmount, 300);
    const gst = await reports.getReport({ ...reportQuery, reportType: 'GST_DETAIL' });
    assert.equal(gst.rows.length, 10);
    assert.equal(gst.summary.invoiceCount, 5);
    assert.equal(gst.summary.billedAmount, 1000);
    const register = await reports.getReport({ ...reportQuery, reportType: 'INVOICE_REGISTER' });
    assert.equal(register.rows.length, 9, 'Document register must retain drafts, cancellations, proformas and credit notes');
    for (const reportType of ['CLIENT_SUMMARY', 'OUTSTANDING', 'PAID', 'GST_DETAIL']) {
      const draftOnly = await reports.getReport({ ...reportQuery, reportType, invoiceStatus: 'DRAFT' });
      assert.equal(draftOnly.rows.length, 0, `${reportType} must not override its issued-invoice scope`);
      assert.equal(draftOnly.summary.billedAmount, 0);
    }
    await invoices().cancel(reportRows[0].id);
    const afterCancellation = await invoices().getDashboardStats();
    assert.equal(Number(afterCancellation.totalBilled), Number(dashboardAfter.totalBilled) - 100);
    assert.equal(Number(afterCancellation.totalOutstanding), Number(dashboardAfter.totalOutstanding) - 100);
    assert.equal((await reports.getReport({ ...reportQuery, reportType: 'OUTSTANDING' })).rows.length, 2);
    console.log('PASS: mixed-status dashboard/report reconciliation, complete document register, multi-item invoice counts, zero balances, filter intersections and cancellation updates.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
