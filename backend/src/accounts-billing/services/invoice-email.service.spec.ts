import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { Invoice } from '../entities';
import { MailStatus } from '../enums';
import { InvoiceEmailService } from './invoice-email.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceDeliveryService } from './invoice-delivery.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
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
    const deliveries = {
      fingerprint: jest.fn(() => 'fingerprint'),
      existing: jest.fn().mockResolvedValue(undefined),
      begin: jest.fn(async (_invoiceId, _requestId, _fingerprint, input) => {
        await logs.save(input);
        return { job: { id: 'job', status: 'PREPARING' }, claimed: true };
      }),
      start: jest.fn(),
      accepted: jest.fn(),
      uncertain: jest.fn(),
      preparationFailed: jest.fn(),
      result: InvoiceDeliveryService.prototype.result,
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
      deliveries as any,
    );
    return {
      service,
      invoices,
      pdf,
      render,
      legacyGenerate,
      email,
      logs,
      deliveries,
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
      expect(x.deliveries.accepted).toHaveBeenCalledWith(
        'job',
        'sample-message',
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
    expect(x.deliveries.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job' }),
      expect.any(String),
      call[1],
      expect.stringContaining('118'),
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
    expect(result.pdfPath).toMatch(
      /^\/uploads\/invoices\/sample-[\da-f-]+\.pdf$/,
    );
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
    expect(x.deliveries.preparationFailed).toHaveBeenCalledWith('job');
    expect(x.deliveries.start).not.toHaveBeenCalled();
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
      expect(x.deliveries.uncertain).toHaveBeenCalledWith(
        'job',
        'skipped' in response,
      );
      expect(x.invoices.updateMailStatus).not.toHaveBeenCalled();
    },
  );

  it('records uncertain transport exceptions without encouraging an unsafe resend', async () => {
    const x = setup();
    x.email.send.mockRejectedValue(new Error('transport unavailable'));
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Do not resend'),
    });
    expect(x.deliveries.uncertain).toHaveBeenCalledWith('job', false);
    expect(x.invoices.updateMailStatus).not.toHaveBeenCalled();
  });

  it('does not report accepted mail as failed when receipt bookkeeping fails', async () => {
    const x = setup();
    x.deliveries.accepted.mockRejectedValue(new Error('database unavailable'));
    const result = await x.service.sendInvoice(
      'sample',
      { toEmail: 'recipient@example.invalid' },
      'actor',
    );
    expect(result).toMatchObject({
      success: true,
      messageId: 'sample-message',
      statusUpdatePending: true,
    });
    expect(result).toHaveProperty(
      'warning',
      expect.stringContaining('Do not resend'),
    );
    expect(x.email.send).toHaveBeenCalledTimes(1);
    expect(x.deliveries.uncertain).not.toHaveBeenCalled();
  });

  it('returns the saved outcome for a retried request without rendering or sending again', async () => {
    const x = setup();
    x.deliveries.existing.mockResolvedValue({
      status: 'RECONCILED',
      message_id: 'prior-message',
    } as any);
    expect(
      await x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid', requestId: 'same-key' },
        'actor',
      ),
    ).toEqual({ success: true, messageId: 'prior-message' });
    expect(x.render).not.toHaveBeenCalled();
    expect(x.email.send).not.toHaveBeenCalled();
  });

  it('does not send when the reservation was already claimed by another request', async () => {
    const x = setup();
    x.deliveries.begin.mockResolvedValue({
      job: { id: 'job', status: 'SENDING' },
      claimed: false,
    });
    expect(
      await x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).toMatchObject({ success: false });
    expect(x.render).not.toHaveBeenCalled();
    expect(x.email.send).not.toHaveBeenCalled();
  });

  it('does not send after its preparation reservation expired', async () => {
    const x = setup();
    x.deliveries.start.mockRejectedValue(new Error('preparation expired'));
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).rejects.toThrow('expired');
    expect(x.email.send).not.toHaveBeenCalled();
  });

  it('does not send if the initial email log cannot be persisted', async () => {
    const x = setup();
    x.logs.save.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).rejects.toThrow('database unavailable');
    expect(x.email.send).not.toHaveBeenCalled();
  });

  it('does not overwrite the same disk file on concurrent renders', async () => {
    const x = setup();
    const [first, second] = await Promise.all([
      x.pdf.generatePdfBuffer('sample'),
      x.pdf.generatePdfBuffer('sample'),
    ]);
    expect(first.pdfPath).not.toBe(second.pdfPath);
    expect(first.fileName).toBe(second.fileName);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      { flag: 'wx' },
    );
  });

  it('removes only its unregistered file and refuses delivery after a stale-snapshot rejection', async () => {
    const x = setup();
    x.invoices.updatePdfPath.mockRejectedValue(new Error('Invoice changed'));
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).rejects.toThrow('Invoice changed');
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      (fs.writeFileSync as jest.Mock).mock.calls[0][0],
    );
    expect(x.email.send).not.toHaveBeenCalled();
  });

  it('does not register a PDF or send mail when disk writing fails', async () => {
    const x = setup();
    (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(
      x.service.sendInvoice(
        'sample',
        { toEmail: 'recipient@example.invalid' },
        'actor',
      ),
    ).rejects.toThrow('disk full');
    expect(x.invoices.updatePdfPath).not.toHaveBeenCalled();
    expect(x.email.send).not.toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});
