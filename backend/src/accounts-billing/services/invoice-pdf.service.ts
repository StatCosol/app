import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { Invoice } from '../entities';
import { InvoiceTemplateService } from './invoice-template.service';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicePdfService {
  private readonly log = new Logger(InvoicePdfService.name);

  constructor(
    private readonly templateService: InvoiceTemplateService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async generatePdf(invoiceId: string): Promise<string> {
    const invoice = await this.invoicesService.findOne(invoiceId);
    const html = await this.templateService.renderInvoiceHtml(invoice);

    const uploadsDir = path.join(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
      });
    } finally {
      if (browser) await browser.close();
    }

    const pdfPath = `/uploads/invoices/${fileName}`;
    await this.invoicesService.updatePdfPath(invoiceId, pdfPath);
    this.log.log(`PDF generated: ${pdfPath}`);
    return pdfPath;
  }
}
