import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { BillingSetting, Invoice } from '../entities';
import { InvoicesService } from './invoices.service';

const BRAND = '#0a2656';        // dark navy (Solutions)
const BRAND_LIGHT = '#3ec6ff';   // cyan/light blue (StatCo)
const LIGHT_BG = '#f8fafc';
const BORDER = '#e2e8f0';
const TEXT = '#1e293b';
const MUTED = '#64748b';
const LINK = '#1d4ed8';

@Injectable()
export class InvoicePdfService {
  private readonly log = new Logger(InvoicePdfService.name);

  constructor(
    @InjectRepository(BillingSetting)
    private readonly settingsRepo: Repository<BillingSetting>,
    private readonly invoicesService: InvoicesService,
  ) {}

  async generatePdf(invoiceId: string): Promise<string> {
    const { pdfPath } = await this.generatePdfBuffer(invoiceId);
    return pdfPath;
  }

  async generatePdfBuffer(
    invoiceId: string,
  ): Promise<{ buffer: Buffer; fileName: string; pdfPath: string }> {
    const invoice = await this.invoicesService.findOne(invoiceId);
    const settings =
      (await this.settingsRepo.findOne({ where: {} })) || ({} as BillingSetting);

    const uploadsDir = path.join(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `${invoice.invoiceNumber.replace(/[\/\\]/g, '-')}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    const buffer = await this.buildPdfBuffer(invoice, settings);
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      this.log.warn(`Could not persist PDF to disk: ${(err as Error).message}`);
    }

    const pdfPath = `/uploads/invoices/${fileName}`;
    try {
      await this.invoicesService.updatePdfPath(invoiceId, pdfPath);
    } catch (err) {
      this.log.warn(`Could not update pdfPath: ${(err as Error).message}`);
    }
    this.log.log(`PDF generated: ${pdfPath} (${buffer.length} bytes)`);
    return { buffer, fileName, pdfPath };
  }

  private buildPdfBuffer(invoice: Invoice, settings: BillingSetting): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true,
        info: { Producer: 'StatComPy', Creator: 'StatComPy Billing' },
      });

      const chunks: Uint8Array[] = [];
      doc.on('data', (c: Uint8Array) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.renderInvoice(doc, invoice, settings);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private renderInvoice(
    doc: PDFKit.PDFDocument,
    invoice: Invoice,
    settings: BillingSetting,
  ): void {
    const pageW = doc.page.width;
    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const contentW = pageW - left - right;

    // ── Letterhead ──
    const headerTop = 40;
    // Left: "StatCo Solutions" wordmark — Times New Roman regular, 33.5pt
    doc.font('Times-Roman').fontSize(33.5);
    const statcoText = 'StatCo';
    const statcoW = doc.widthOfString(statcoText);
    const wordmarkH = doc.heightOfString(statcoText);
    doc.fillColor(BRAND_LIGHT).text(statcoText, left, headerTop, { lineBreak: false });
    doc
      .fillColor(BRAND)
      .text(' Solutions', left + statcoW, headerTop, { lineBreak: false });

    // Right: Email + Phone + Website with aligned label column.
    // Labels right-justify just before a fixed value-start X so all labels and
    // all values line up vertically (instead of each line being floated to the right edge).
    const valueStartX = pageW - right - 165;
    const labelGap = 4;
    const lineGap = 14;
    let contactY = headerTop + 2;

    const drawAlignedLine = (
      label: string,
      value: string,
      y: number,
      opts?: { underline?: boolean; valueColor?: string },
    ) => {
      doc.font('Times-Roman').fontSize(11);
      const labelW = doc.widthOfString(label);
      const labelX = valueStartX - labelGap - labelW;
      doc.fillColor(TEXT).text(label, labelX, y, { lineBreak: false });
      doc
        .fillColor(opts?.valueColor || TEXT)
        .text(value, valueStartX, y, { lineBreak: false });
      if (opts?.underline) {
        const valueW = doc.widthOfString(value);
        const underlineY = y + doc.currentLineHeight() - 1;
        doc
          .moveTo(valueStartX, underlineY)
          .lineTo(valueStartX + valueW, underlineY)
          .strokeColor(opts?.valueColor || TEXT)
          .lineWidth(0.5)
          .stroke();
      }
    };

    drawAlignedLine('Email-', 'finance@statcosol.com', contactY, {
      underline: true,
      valueColor: LINK,
    });
    contactY += lineGap;
    drawAlignedLine('Ph.No-', '+91 9000607839', contactY);
    contactY += lineGap;
    drawAlignedLine('Website-', 'www.statcosol.com', contactY, {
      underline: true,
      valueColor: LINK,
    });

    // Reset cursor below header (use the taller of wordmark or contact column)
    doc.x = left;
    doc.y = headerTop + Math.max(wordmarkH, contactY - headerTop + 4) + 6;

    // Subtle horizontal divider
    doc
      .moveTo(left, doc.y)
      .lineTo(pageW - right, doc.y)
      .strokeColor(BORDER)
      .lineWidth(0.75)
      .stroke();
    doc.y += 14;

    // ── Centered "TAX INVOICE" title ──
    const titleText = (invoice.invoiceType || 'TAX_INVOICE').replace(/_/g, ' ').toUpperCase();
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(BRAND)
      .text(titleText, left, doc.y, { align: 'center', width: contentW });
    doc.y += 8;

    // ── Invoice meta (left aligned) ──
    doc.font('Helvetica').fontSize(10).fillColor(TEXT);
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, left, doc.y, {
      width: contentW,
      align: 'left',
    });
    doc.text(`Date: ${this.fmtDate(invoice.invoiceDate)}`, left, doc.y, {
      width: contentW,
      align: 'left',
    });
    doc.x = left;
    doc.y += 8;

    // ── From / To boxes ──
    const boxH = 95;
    const boxW = (contentW - 10) / 2;
    const boxY = doc.y;
    this.partyBox(doc, left, boxY, boxW, boxH, 'From', [
      settings.legalName || 'StatCo Solutions',
      settings.address || '',
      `GSTIN: ${settings.gstin || ''}`,
      `State: ${settings.stateName || ''} (${settings.stateCode || ''})`,
    ]);
    const client = invoice.billingClient;
    this.partyBox(doc, left + boxW + 10, boxY, boxW, boxH, 'To', [
      client?.legalName || '',
      client?.billingAddress || '',
      `GSTIN: ${client?.gstin || 'N/A'}`,
      `State: ${client?.stateName || ''} (${client?.stateCode || ''})`,
    ]);
    doc.x = left;
    doc.y = boxY + boxH + 10;

    // ── Meta row ──
    doc.fontSize(9).fillColor(TEXT).font('Helvetica');
    const metaY = doc.y;
    const metaColW = contentW / 3;
    this.metaCell(doc, left, metaY, metaColW, 'Invoice Date', this.fmtDate(invoice.invoiceDate));
    this.metaCell(
      doc,
      left + metaColW,
      metaY,
      metaColW,
      'Due Date',
      this.fmtDate(invoice.dueDate),
    );
    this.metaCell(
      doc,
      left + metaColW * 2,
      metaY,
      metaColW,
      'Place of Supply',
      invoice.placeOfSupply || client?.stateName || '',
    );
    doc.x = left;
    doc.y = metaY + 22;

    // ── Items table ──
    const headers: Array<{ label: string; w: number; align: 'left' | 'right' | 'center' }> = [
      { label: '#', w: 18, align: 'center' },
      { label: 'Description', w: 0, align: 'left' },
      { label: 'Qty', w: 28, align: 'center' },
      { label: 'Rate', w: 50, align: 'right' },
      { label: 'Amount', w: 55, align: 'right' },
      { label: 'Disc.', w: 42, align: 'right' },
      { label: 'Taxable', w: 55, align: 'right' },
      { label: 'GST%', w: 32, align: 'right' },
      { label: 'GST Amt', w: 55, align: 'right' },
      { label: 'Total', w: 60, align: 'right' },
    ];
    const fixedW = headers.reduce((s, h) => s + h.w, 0);
    headers[1].w = contentW - fixedW;

    this.itemsTable(doc, left, doc.y, contentW, headers, invoice);

    // ── Totals box (right-aligned) ──
    doc.y += 10;
    const totalsW = 240;
    const totalsX = pageW - right - totalsW;
    const intraState = +(invoice.cgstAmount || 0) > 0;
    const totalsRows: Array<{ label: string; value: string; bold?: boolean; brand?: boolean }> = [
      { label: 'Sub Total', value: this.inr(invoice.subTotal) },
      { label: 'Discount', value: this.inr(invoice.discountTotal) },
      { label: 'Taxable Value', value: this.inr(invoice.taxableValue) },
    ];
    if (intraState) {
      totalsRows.push({ label: `CGST @ ${invoice.cgstRate}%`, value: this.inr(invoice.cgstAmount) });
      totalsRows.push({ label: `SGST @ ${invoice.sgstRate}%`, value: this.inr(invoice.sgstAmount) });
    } else {
      totalsRows.push({ label: `IGST @ ${invoice.igstRate}%`, value: this.inr(invoice.igstAmount) });
    }
    totalsRows.push({ label: 'Round Off', value: this.inr(invoice.roundOff) });
    totalsRows.push({
      label: 'Grand Total',
      value: this.inr(invoice.grandTotal),
      bold: true,
      brand: true,
    });

    let ty = doc.y;
    for (const row of totalsRows) {
      const rowH = 18;
      if (row.brand) {
        doc.rect(totalsX, ty, totalsW, rowH).fill(BRAND);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
      } else {
        doc.rect(totalsX, ty, totalsW, rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.fillColor(TEXT).font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      }
      doc.text(row.label, totalsX + 6, ty + 5, { width: totalsW / 2, align: 'left' });
      doc.text(row.value, totalsX + totalsW / 2, ty + 5, {
        width: totalsW / 2 - 6,
        align: 'right',
      });
      ty += rowH;
    }
    doc.x = left;
    doc.y = ty + 14;

    // ── Bank + Declaration ──
    const footH = 90;
    const footY = doc.y;
    const footColW = (contentW - 10) / 2;
    this.infoBox(doc, left, footY, footColW, footH, 'Bank Details', [
      `Account Name: ${settings.bankAccountName || ''}`,
      `Bank: ${settings.bankName || ''}`,
      `A/C No: ${settings.accountNumber || ''}`,
      `IFSC: ${settings.ifscCode || ''}`,
      `Branch: ${settings.branchName || ''}`,
    ]);
    this.infoBox(doc, left + footColW + 10, footY, footColW, footH, 'Declaration', [
      settings.termsAndConditions ||
        'We declare that this invoice shows the actual price of the services provided and that all particulars are true and correct.',
    ]);
    doc.x = left;
    doc.y = footY + footH + 20;

    // ── Signature ──
    const sigX = pageW - right - 200;
    doc.fontSize(9).fillColor(TEXT).font('Helvetica');
    doc.text(`For ${settings.legalName || 'StatCo Solutions'}`, sigX, doc.y, {
      width: 200,
      align: 'right',
    });
    doc.y += 6;
    // Signature image (if present)
    const sigCandidates = [
      path.join(process.cwd(), 'assets', 'signature.png'),
      path.join(__dirname, '..', '..', '..', '..', 'assets', 'signature.png'),
      path.join(__dirname, '..', '..', '..', 'assets', 'signature.png'),
    ];
    const sigPath = sigCandidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    if (sigPath) {
      try {
        // Seal is circular - keep aspect ratio square to avoid stretching.
        const imgSize = 75;
        // Center the seal under the "For StatCo Solutions" line (sigX..sigX+200).
        doc.image(sigPath, sigX + (200 - imgSize) / 2, doc.y, {
          fit: [imgSize, imgSize],
          align: 'center',
          valign: 'center',
        });
        doc.y += imgSize + 2;
      } catch (e) {
        this.log.warn(`Signature image render failed: ${(e as Error).message}`);
        doc.y += 40;
      }
    } else {
      this.log.warn(
        `Signature image not found. Looked in: ${sigCandidates.join(', ')}`,
      );
      doc.y += 40;
    }
    doc.font('Helvetica-Bold').text('Authorized Signatory', sigX, doc.y, {
      width: 200,
      align: 'right',
    });
    doc.x = left;

    // ── Page numbers ──
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(7)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `Page ${i + 1} of ${pages.count}  \u2022  Generated ${new Date()
            .toISOString()
            .slice(0, 10)}`,
          40,
          doc.page.height - 25,
          { align: 'center', width: doc.page.width - 80, lineBreak: false },
        );
      doc.page.margins.bottom = savedBottom;
    }
  }

  // ────── Helpers ──────

  private partyBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    lines: string[],
  ): void {
    doc.rect(x, y, w, h).fill(LIGHT_BG);
    doc.rect(x, y, w, h).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text(title, x + 8, y + 6);
    doc.fillColor(TEXT).font('Helvetica').fontSize(9);
    let ly = y + 20;
    if (lines[0]) {
      doc.font('Helvetica-Bold').text(lines[0], x + 8, ly, { width: w - 16 });
      ly = doc.y;
      doc.font('Helvetica');
    }
    for (let i = 1; i < lines.length; i++) {
      if (ly > y + h - 10) break;
      doc.text(lines[i], x + 8, ly, { width: w - 16 });
      ly = doc.y;
    }
    doc.x = x;
  }

  private metaCell(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
  ): void {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, x, y, { width: w });
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(10).text(value, x, y + 10, { width: w });
  }

  private itemsTable(
    doc: PDFKit.PDFDocument,
    startX: number,
    startY: number,
    totalW: number,
    headers: Array<{ label: string; w: number; align: 'left' | 'right' | 'center' }>,
    invoice: Invoice,
  ): void {
    const headerH = 22;
    const padX = 4;
    const padY = 5;

    const drawHeader = (atY: number): number => {
      doc.rect(startX, atY, totalW, headerH).fill(BRAND);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      let cx = startX;
      for (const h of headers) {
        doc.text(h.label, cx + padX, atY + 7, {
          width: h.w - padX * 2,
          align: h.align,
          lineBreak: false,
        });
        cx += h.w;
      }
      return atY + headerH;
    };

    let curY = drawHeader(startY);

    const items = (invoice.items || []).slice().sort((a, b) => a.sequence - b.sequence);
    doc.font('Helvetica').fontSize(8).fillColor(TEXT);

    items.forEach((item, idx) => {
      const descText =
        (item.serviceDescription || '') + (item.sacCode ? `\nSAC: ${item.sacCode}` : '');
      const descCol = headers[1];
      const descH = doc.heightOfString(descText, {
        width: descCol.w - padX * 2,
        align: 'left',
      });
      const rowH = Math.max(20, descH + padY * 2);

      if (curY + rowH > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        curY = drawHeader(doc.page.margins.top);
        doc.font('Helvetica').fontSize(8).fillColor(TEXT);
      }

      if (idx % 2 === 1) {
        doc.rect(startX, curY, totalW, rowH).fill(LIGHT_BG);
      }
      doc.rect(startX, curY, totalW, rowH).strokeColor(BORDER).lineWidth(0.5).stroke();

      const cells = [
        String(idx + 1),
        descText,
        String(item.quantity ?? ''),
        this.inr(item.rate),
        this.inr(item.amount),
        this.inr(item.discountAmount),
        this.inr(item.taxableAmount),
        `${item.gstRate}%`,
        this.inr(item.gstAmount),
        this.inr(item.lineTotal),
      ];
      let ccx = startX;
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        doc
          .fillColor(TEXT)
          .font('Helvetica')
          .fontSize(8)
          .text(cells[i], ccx + padX, curY + padY, {
            width: h.w - padX * 2,
            align: h.align,
          });
        ccx += h.w;
      }
      curY += rowH;
      doc.x = startX;
    });

    if (items.length === 0) {
      doc.rect(startX, curY, totalW, 24).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text('No items', startX, curY + 8, { width: totalW, align: 'center' });
      curY += 24;
    }

    doc.x = startX;
    doc.y = curY;
  }

  private infoBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    lines: string[],
  ): void {
    doc.rect(x, y, w, h).fill(LIGHT_BG);
    doc.rect(x, y, w, h).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text(title, x + 8, y + 6);
    doc.fillColor(TEXT).font('Helvetica').fontSize(8);
    let ly = y + 20;
    for (const line of lines) {
      if (ly > y + h - 10) break;
      doc.text(line, x + 8, ly, { width: w - 16 });
      ly = doc.y;
    }
    doc.x = x;
  }

  private inr(n: number | string | null | undefined): string {
    const num = typeof n === 'string' ? parseFloat(n) : Number(n ?? 0);
    if (!isFinite(num)) return '0.00';
    return (
      '\u20B9' +
      num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  private fmtDate(d: any): string {
    if (!d) return '';
    let dt: Date;
    if (d instanceof Date) {
      dt = d;
    } else {
      const s = String(d);
      // Accept YYYY-MM-DD or full ISO
      dt = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
    }
    if (isNaN(dt.getTime())) return String(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
}
