import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { Invoice } from '../entities';
import { MailStatus } from '../enums';
import { InvoiceEmailService } from './invoice-email.service';
import { InvoicePdfService } from './invoice-pdf.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  writeFileSync: jest.fn(),
}));

describe('Invoice email snapshot consistency', () => {
  function setup(pdfPath?: string) {
    const snapshot = {
      id: 'sample',
      invoiceNumber: 'TEST/2627/0001',
      invoiceDate: '2026-09-27',
      dueDate: '2026-10-27',
      grandTotal: 118,
      purchaseOrderNumber: 'PO-ORIGINAL',
      proformaReferenceNumber: 'PI-ORIGINAL',
      pdfPath,
      billingClient: { contactPerson: 'Sample contact' },
    } as Invoice;
    let current = snapshot;
    const invoices = {
      findOne: jest.fn(async () => structuredClone(current)),
      updatePdfPath: jest.fn(async () => undefined),
      updateMailStatus: jest.fn(async () => undefined),
    };
    const settings = { findOne: jest.fn(async () => ({})) };
    const pdf = new InvoicePdfService(settings as any, invoices as any);
    // No PDF layout changes here: capture the renderer's input as test bytes,
    // exercising the real PDF orchestration without writing files or emailing.
    const render = jest
      .spyOn(pdf as any, 'buildPdfBuffer')
      .mockImplementation(async (invoice: unknown) =>
        Buffer.from(JSON.stringify(invoice)),
      );
    const legacyGenerate = jest.spyOn(pdf, 'generatePdf');
    const email = {
      send: jest
        .fn()
        .mockResolvedValue({ ok: true, messageId: 'sample-message' }),
    };
    const logs = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new InvoiceEmailService(
      logs as any,
      email as any,
      invoices as any,
      pdf,
      new ConfigService({
        INVOICE_FROM_NAME: 'Test sender',
        INVOICE_FROM_EMAIL: 'sender@example.invalid',
      }),
    );
    return {
      service,
      invoices,
      pdf,
      render,
      legacyGenerate,
      email,
      logs,
      snapshot,
      edit: () => {
        current = {
          ...snapshot,
          grandTotal: 999,
          invoiceDate: '2026-10-01',
          dueDate: '2026-11-01',
          purchaseOrderNumber: 'PO-NEW',
          proformaReferenceNumber: 'PI-NEW',
        };
      },
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it.each([undefined, '/uploads/invoices/existing.pdf'])(
    'reads and renders exactly once (existing PDF: %s)',
    async (pdfPath) => {
      const x = setup(pdfPath);
      const result = await x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      );
      expect(result).toEqual({ success: true, messageId: 'sample-message' });
      expect(x.invoices.findOne).toHaveBeenCalledTimes(1);
      expect(x.render).toHaveBeenCalledTimes(1);
      expect(x.legacyGenerate).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(x.invoices.updatePdfPath).toHaveBeenCalledTimes(1);
      expect(x.email.send).toHaveBeenCalledTimes(1);
      expect(x.invoices.updateMailStatus).toHaveBeenCalledWith(
        'sample',
        MailStatus.SENT,
      );
    },
  );

  it('keeps default email text and attachment on one snapshot when an edit commits immediately after the initial read', async () => {
    const x = setup();
    x.invoices.findOne.mockImplementationOnce(async () => {
      x.edit();
      return structuredClone(x.snapshot);
    });
    await x.service.sendInvoice(
      'sample',
      { toEmail: 'recipient@example.invalid' },
      'actor',
    );
    const call = x.email.send.mock.calls[0];
    expect(call[1]).toContain('PO-ORIGINAL');
    expect(call[1]).toContain('PI-ORIGINAL');
    expect(call[3]).toContain('118');
    expect(call[3]).toContain('2026-09-27');
    expect(call[3]).toContain('2026-10-27');
    expect(call[3]).not.toContain('999');
    const attachment = call[5].attachments[0];
    expect(attachment.filename).toBe('TEST-2627-0001.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    expect(JSON.parse(attachment.content.toString())).toMatchObject({
      grandTotal: 118,
      purchaseOrderNumber: 'PO-ORIGINAL',
    });
    expect(x.logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: call[1],
        body: expect.stringContaining('118'),
      }),
    );
    expect(x.invoices.findOne).toHaveBeenCalledTimes(1);

    // A later request must fetch the edited invoice, not cache the old snapshot.
    await x.service.sendInvoice(
      'sample',
      { toEmail: 'recipient@example.invalid' },
      'actor',
    );
    const next = x.email.send.mock.calls[1];
    expect(next[1]).toContain('PO-NEW');
    expect(next[3]).toContain('999');
    expect(
      JSON.parse(next[5].attachments[0].content.toString()).grandTotal,
    ).toBe(999);
    expect(x.invoices.findOne).toHaveBeenCalledTimes(2);
  });

  it('exposes the exact rendered snapshot without changing the download result fields', async () => {
    const x = setup();
    const result = await x.pdf.generatePdfBuffer('sample');
    expect(result.invoice).toBe(x.render.mock.calls[0][0]);
    expect(result.fileName).toBe('TEST-2627-0001.pdf');
    expect(result.pdfPath).toBe('/uploads/invoices/TEST-2627-0001.pdf');
    expect(result.buffer).toEqual(Buffer.from(JSON.stringify(result.invoice)));
  });

  it('preserves explicit subject/body and recipient choices', async () => {
    const x = setup();
    await x.service.sendInvoice(
      'sample',
      {
        toEmail: 'recipient@example.invalid',
        ccEmail: 'copy@example.invalid',
        bccEmail: 'private@example.invalid',
        subject: 'Custom subject',
        body: 'Custom body',
      },
      'actor',
    );
    expect(x.email.send).toHaveBeenCalledWith(
      'recipient@example.invalid',
      'Custom subject',
      expect.any(String),
      '<p>Custom body</p>',
      { name: 'Test sender', email: 'sender@example.invalid' },
      expect.objectContaining({
        cc: 'copy@example.invalid',
        bcc: 'private@example.invalid',
      }),
    );
  });

  it('does not send or record success when generation fails', async () => {
    const x = setup();
    x.render.mockRejectedValue(new Error('render failed'));
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).rejects.toThrow('render failed');
    expect(x.email.send).not.toHaveBeenCalled();
    expect(x.logs.save).not.toHaveBeenCalled();
    expect(x.invoices.updateMailStatus).not.toHaveBeenCalled();
  });

  it.each([{ ok: false, error: 'provider rejected' }, { skipped: true }])(
    'retains failed delivery behavior: %j',
    async (response) => {
      const x = setup();
      x.email.send.mockResolvedValue(response);
      expect(
        await x.service.sendInvoice(
          'sample',
          { toEmail: 'recipient@example.invalid' },
          'actor',
        ),
      ).toMatchObject({ success: false });
      expect(x.logs.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ sentStatus: MailStatus.FAILED }),
      );
      expect(x.invoices.updateMailStatus).not.toHaveBeenCalled();
    },
  );

  it('records and propagates a transport exception without marking the invoice sent', async () => {
    const x = setup();
    x.email.send.mockRejectedValue(new Error('transport unavailable'));
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).rejects.toThrow('transport unavailable');
    expect(x.logs.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sentStatus: MailStatus.FAILED,
        failureReason: 'transport unavailable',
      }),
    );
    expect(x.invoices.updateMailStatus).not.toHaveBeenCalled();
  });
});
