import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { Invoice } from '../entities';
import { InvoiceStatus, InvoiceType, PaymentStatus } from '../enums';

export type BillingReportType =
  | 'GST_DETAIL'
  | 'CLIENT_SUMMARY'
  | 'INVOICE_REGISTER'
  | 'OUTSTANDING'
  | 'PAID';

export interface BillingReportQuery {
  reportType?: string;
  fromDate?: string;
  toDate?: string;
  clientId?: string;
  invoiceStatus?: string;
  paymentStatus?: string;
  sacCode?: string;
  search?: string;
}

interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'currency' | 'percent';
  width?: number;
}

export interface BillingReportResult {
  reportType: BillingReportType;
  title: string;
  generatedAt: string;
  filters: Record<string, string>;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, number>;
}

const REPORT_TYPES = new Set<BillingReportType>([
  'GST_DETAIL',
  'CLIENT_SUMMARY',
  'INVOICE_REGISTER',
  'OUTSTANDING',
  'PAID',
]);

const ISSUED_STATUSES = [
  InvoiceStatus.APPROVED,
  InvoiceStatus.GENERATED,
  InvoiceStatus.EMAILED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
];

@Injectable()
export class BillingReportsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async getReport(query: BillingReportQuery): Promise<BillingReportResult> {
    const reportType = this.parseReportType(query.reportType);
    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.billingClient', 'client')
      .leftJoinAndSelect('inv.items', 'item')
      .orderBy('inv.invoiceDate', 'DESC')
      .addOrderBy('inv.invoiceNumber', 'DESC')
      .addOrderBy('item.sequence', 'ASC');

    if (query.fromDate) {
      qb.andWhere('inv.invoice_date >= :fromDate', {
        fromDate: query.fromDate,
      });
    }
    if (query.toDate) {
      qb.andWhere('inv.invoice_date <= :toDate', { toDate: query.toDate });
    }
    if (query.clientId) {
      qb.andWhere('inv.billing_client_id = :clientId', {
        clientId: query.clientId,
      });
    }
    if (query.invoiceStatus) {
      qb.andWhere('inv.invoice_status = :invoiceStatus', {
        invoiceStatus: query.invoiceStatus,
      });
    }
    if (query.paymentStatus) {
      qb.andWhere('inv.payment_status = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }
    if (query.sacCode?.trim()) {
      qb.andWhere(
        '(item.sac_code ILIKE :sacCode OR client.default_sac_code ILIKE :sacCode)',
        { sacCode: `%${query.sacCode.trim()}%` },
      );
    }
    if (query.search?.trim()) {
      qb.andWhere(
        `(inv.invoice_number ILIKE :search
          OR client.legal_name ILIKE :search
          OR client.gstin ILIKE :search
          OR item.service_description ILIKE :search
          OR item.sac_code ILIKE :search)`,
        { search: `%${query.search.trim()}%` },
      );
    }

    if (reportType === 'GST_DETAIL') {
      qb.andWhere('inv.invoice_type = :taxInvoice', {
        taxInvoice: InvoiceType.TAX_INVOICE,
      }).andWhere('inv.invoice_status IN (:...issuedStatuses)', {
        issuedStatuses: ISSUED_STATUSES,
      });
    } else if (reportType === 'CLIENT_SUMMARY') {
      qb.andWhere('inv.invoice_type = :taxInvoice', {
        taxInvoice: InvoiceType.TAX_INVOICE,
      }).andWhere('inv.invoice_status != :cancelled', {
        cancelled: InvoiceStatus.CANCELLED,
      });
    } else if (reportType === 'OUTSTANDING') {
      qb.andWhere('inv.invoice_type = :taxInvoice', {
        taxInvoice: InvoiceType.TAX_INVOICE,
      })
        .andWhere('inv.invoice_status != :cancelled', {
          cancelled: InvoiceStatus.CANCELLED,
        })
        .andWhere('inv.payment_status IN (:...openPaymentStatuses)', {
          openPaymentStatuses: [
            PaymentStatus.UNPAID,
            PaymentStatus.PARTIALLY_PAID,
          ],
        })
        .andWhere('inv.balance_outstanding > 0');
    } else if (reportType === 'PAID') {
      qb.andWhere('inv.invoice_type = :taxInvoice', {
        taxInvoice: InvoiceType.TAX_INVOICE,
      })
        .andWhere('inv.invoice_status != :cancelled', {
          cancelled: InvoiceStatus.CANCELLED,
        })
        .andWhere('inv.payment_status = :paid', {
          paid: PaymentStatus.PAID,
        });
    }

    const invoices = await qb.getMany();
    return this.buildReport(reportType, invoices, query);
  }

  async exportReport(query: BillingReportQuery): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    const report = await this.getReport(query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'StatCo';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    this.addSummarySheet(workbook, report);
    this.addDataSheet(workbook, report);

    const dateSuffix = new Date().toISOString().slice(0, 10);
    const fileName = `${report.reportType.toLowerCase().replace(/_/g, '-')}-${dateSuffix}.xlsx`;
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName,
    };
  }

  private buildReport(
    reportType: BillingReportType,
    invoices: Invoice[],
    query: BillingReportQuery,
  ): BillingReportResult {
    const filters = Object.fromEntries(
      Object.entries(query)
        .filter(([key, value]) => key !== 'reportType' && Boolean(value))
        .map(([key, value]) => [key, String(value)]),
    );

    if (reportType === 'GST_DETAIL') {
      const rows = invoices.flatMap((invoice) =>
        (invoice.items || []).map((item) => {
          const gstAmount = this.num(item.gstAmount);
          const isIgst = this.num(invoice.igstAmount) > 0;
          const cgstAmount = isIgst ? 0 : this.round(gstAmount / 2);
          const sgstAmount = isIgst ? 0 : this.round(gstAmount - cgstAmount);
          return {
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            financialYear: invoice.financialYear,
            clientName: invoice.billingClient?.legalName || '',
            clientGstin: invoice.billingClient?.gstin || invoice.gstin || '',
            placeOfSupply:
              invoice.placeOfSupply ||
              invoice.billingClient?.placeOfSupply ||
              '',
            stateCode:
              invoice.stateCode || invoice.billingClient?.stateCode || '',
            purchaseOrderNumber: invoice.purchaseOrderNumber || '',
            invoiceDescription:
              item.serviceDescription || invoice.remarks || '',
            sacHsn: item.sacCode || invoice.billingClient?.defaultSacCode || '',
            quantity: this.num(item.quantity),
            rate: this.num(item.rate),
            taxableValue: this.num(item.taxableAmount),
            gstRate: this.num(item.gstRate),
            cgstAmount,
            sgstAmount,
            igstAmount: isIgst ? gstAmount : 0,
            lineTotal: this.num(item.lineTotal),
            invoiceTotal: this.num(invoice.grandTotal),
          };
        }),
      );
      return this.result(
        reportType,
        'GST Invoice Detail',
        filters,
        [
          this.col('invoiceNumber', 'Invoice #', 'text', 20),
          this.col('invoiceDate', 'Invoice Date', 'date', 14),
          this.col('financialYear', 'Financial Year', 'text', 14),
          this.col('clientName', 'Client', 'text', 28),
          this.col('clientGstin', 'Client GSTIN', 'text', 18),
          this.col('placeOfSupply', 'Place of Supply', 'text', 20),
          this.col('stateCode', 'State Code', 'text', 11),
          this.col('purchaseOrderNumber', 'PO Number', 'text', 18),
          this.col('invoiceDescription', 'Invoice Description', 'text', 42),
          this.col('sacHsn', 'SAC/HSN', 'text', 14),
          this.col('quantity', 'Quantity', 'number', 12),
          this.col('rate', 'Rate', 'currency', 14),
          this.col('taxableValue', 'Taxable Value', 'currency', 16),
          this.col('gstRate', 'GST Rate', 'percent', 12),
          this.col('cgstAmount', 'CGST', 'currency', 14),
          this.col('sgstAmount', 'SGST', 'currency', 14),
          this.col('igstAmount', 'IGST', 'currency', 14),
          this.col('lineTotal', 'Line Total', 'currency', 16),
          this.col('invoiceTotal', 'Invoice Total', 'currency', 16),
        ],
        rows,
        this.invoiceSummary(invoices),
      );
    }

    if (reportType === 'CLIENT_SUMMARY') {
      const grouped = new Map<string, Record<string, unknown>>();
      for (const invoice of invoices) {
        const key = invoice.billingClientId;
        const current = grouped.get(key) || {
          clientCode: invoice.billingClient?.billingCode || '',
          clientName: invoice.billingClient?.legalName || '',
          gstin: invoice.billingClient?.gstin || '',
          invoiceCount: 0,
          taxableValue: 0,
          gstAmount: 0,
          billedAmount: 0,
          receivedAmount: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
        };
        current['invoiceCount'] = this.num(current['invoiceCount']) + 1;
        current['taxableValue'] =
          this.num(current['taxableValue']) + this.num(invoice.taxableValue);
        current['gstAmount'] =
          this.num(current['gstAmount']) +
          this.num(invoice.cgstAmount) +
          this.num(invoice.sgstAmount) +
          this.num(invoice.igstAmount);
        current['billedAmount'] =
          this.num(current['billedAmount']) + this.num(invoice.grandTotal);
        current['receivedAmount'] =
          this.num(current['receivedAmount']) +
          this.num(invoice.amountReceived);
        current['outstandingAmount'] =
          this.num(current['outstandingAmount']) +
          this.num(invoice.balanceOutstanding);
        if (this.overdueDays(invoice.dueDate) > 0) {
          current['overdueAmount'] =
            this.num(current['overdueAmount']) +
            this.num(invoice.balanceOutstanding);
        }
        grouped.set(key, current);
      }
      const rows = [...grouped.values()].sort(
        (a, b) =>
          this.num(b['outstandingAmount']) - this.num(a['outstandingAmount']),
      );
      return this.result(
        reportType,
        'Client-wise Billing Summary',
        filters,
        [
          this.col('clientCode', 'Client Code', 'text', 16),
          this.col('clientName', 'Client', 'text', 30),
          this.col('gstin', 'GSTIN', 'text', 18),
          this.col('invoiceCount', 'Invoices', 'number', 12),
          this.col('taxableValue', 'Taxable Value', 'currency', 16),
          this.col('gstAmount', 'GST', 'currency', 14),
          this.col('billedAmount', 'Billed', 'currency', 16),
          this.col('receivedAmount', 'Received', 'currency', 16),
          this.col('outstandingAmount', 'Outstanding', 'currency', 16),
          this.col('overdueAmount', 'Overdue', 'currency', 16),
        ],
        rows,
        this.invoiceSummary(invoices),
      );
    }

    const rows = invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate || '',
      clientCode: invoice.billingClient?.billingCode || '',
      clientName: invoice.billingClient?.legalName || '',
      gstin: invoice.billingClient?.gstin || invoice.gstin || '',
      descriptions: this.unique(
        invoice.items?.map((i) => i.serviceDescription),
      ),
      sacHsn: this.unique(
        invoice.items?.map(
          (i) => i.sacCode || invoice.billingClient?.defaultSacCode,
        ),
      ),
      taxableValue: this.num(invoice.taxableValue),
      gstAmount:
        this.num(invoice.cgstAmount) +
        this.num(invoice.sgstAmount) +
        this.num(invoice.igstAmount),
      grandTotal: this.num(invoice.grandTotal),
      amountReceived: this.num(invoice.amountReceived),
      balanceOutstanding: this.num(invoice.balanceOutstanding),
      invoiceStatus: invoice.invoiceStatus,
      paymentStatus: invoice.paymentStatus,
      overdueDays: this.overdueDays(invoice.dueDate),
      agingBucket: this.agingBucket(invoice.dueDate),
      purchaseOrderNumber: invoice.purchaseOrderNumber || '',
      proformaReference: invoice.proformaReferenceNumber || '',
    }));
    const title =
      reportType === 'OUTSTANDING'
        ? 'Outstanding Invoice Aging'
        : reportType === 'PAID'
          ? 'Paid Invoice Register'
          : 'Invoice Register';
    return this.result(
      reportType,
      title,
      filters,
      [
        this.col('invoiceNumber', 'Invoice #', 'text', 20),
        this.col('invoiceType', 'Invoice Type', 'text', 16),
        this.col('invoiceDate', 'Invoice Date', 'date', 14),
        this.col('dueDate', 'Due Date', 'date', 14),
        this.col('clientCode', 'Client Code', 'text', 15),
        this.col('clientName', 'Client', 'text', 28),
        this.col('gstin', 'GSTIN', 'text', 18),
        this.col('descriptions', 'Invoice Description', 'text', 42),
        this.col('sacHsn', 'SAC/HSN', 'text', 14),
        this.col('taxableValue', 'Taxable Value', 'currency', 16),
        this.col('gstAmount', 'GST', 'currency', 14),
        this.col('grandTotal', 'Invoice Total', 'currency', 16),
        this.col('amountReceived', 'Received', 'currency', 16),
        this.col('balanceOutstanding', 'Outstanding', 'currency', 16),
        this.col('invoiceStatus', 'Invoice Status', 'text', 18),
        this.col('paymentStatus', 'Payment Status', 'text', 18),
        this.col('overdueDays', 'Overdue Days', 'number', 14),
        this.col('agingBucket', 'Aging Bucket', 'text', 14),
        this.col('purchaseOrderNumber', 'PO Number', 'text', 18),
        this.col('proformaReference', 'Proforma Reference', 'text', 20),
      ],
      rows,
      this.invoiceSummary(invoices),
    );
  }

  private addSummarySheet(
    workbook: ExcelJS.Workbook,
    report: BillingReportResult,
  ): void {
    const sheet = workbook.addWorksheet('Summary', {
      views: [{ showGridLines: false }],
    });
    sheet.columns = [{ width: 28 }, { width: 24 }, { width: 4 }, { width: 28 }];
    sheet.mergeCells('A1:D1');
    const title = sheet.getCell('A1');
    title.value = report.title;
    title.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173A63' },
    };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 34;
    sheet.getCell('A3').value = 'Generated at';
    sheet.getCell('B3').value = new Date(report.generatedAt);
    sheet.getCell('B3').numFmt = 'dd-mmm-yyyy hh:mm';
    sheet.getCell('A4').value = 'Report rows';
    sheet.getCell('B4').value = report.rows.length;

    let row = 6;
    sheet.getCell(`A${row}`).value = 'Applied Filters';
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF173A63' } };
    row += 1;
    const filters = Object.entries(report.filters);
    if (!filters.length) {
      sheet.getCell(`A${row}`).value = 'None';
      row += 2;
    } else {
      for (const [key, value] of filters) {
        sheet.getCell(`A${row}`).value = this.humanize(key);
        sheet.getCell(`B${row}`).value = this.safeText(value);
        row += 1;
      }
      row += 1;
    }

    sheet.getCell(`A${row}`).value = 'Key Metrics';
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF173A63' } };
    row += 1;
    for (const [key, value] of Object.entries(report.summary)) {
      sheet.getCell(`A${row}`).value = this.humanize(key);
      sheet.getCell(`B${row}`).value = value;
      sheet.getCell(`B${row}`).numFmt = key.toLowerCase().includes('count')
        ? '#,##0'
        : '₹#,##0.00;[Red]-₹#,##0.00';
      row += 1;
    }
    for (let rowNumber = 3; rowNumber <= row; rowNumber += 1) {
      sheet.getRow(rowNumber).getCell(1).font = {
        bold: true,
        color: { argb: 'FF475569' },
      };
    }
  }

  private addDataSheet(
    workbook: ExcelJS.Workbook,
    report: BillingReportResult,
  ): void {
    const sheet = workbook.addWorksheet('Report Data', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    sheet.columns = report.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: column.width || 18,
    }));
    const header = sheet.getRow(1);
    header.height = 28;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173A63' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const source of report.rows) {
      const row: Record<string, unknown> = {};
      for (const column of report.columns) {
        const value = source[column.key];
        if (column.type === 'date' && value) {
          row[column.key] = new Date(
            `${this.textValue(value).slice(0, 10)}T00:00:00`,
          );
        } else if (column.type === 'text') {
          row[column.key] = this.safeText(value);
        } else {
          row[column.key] = value ?? null;
        }
      }
      sheet.addRow(row);
    }

    const lastDataRow = Math.max(1, report.rows.length + 1);
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastDataRow, column: report.columns.length },
    };
    report.columns.forEach((column, index) => {
      const cells = sheet.getColumn(index + 1);
      if (column.type === 'currency')
        cells.numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
      if (column.type === 'number') cells.numFmt = '#,##0.00';
      if (column.type === 'percent') cells.numFmt = '0.00"%"';
      if (column.type === 'date') cells.numFmt = 'dd-mmm-yyyy';
      cells.alignment = {
        vertical: 'top',
        horizontal:
          column.type === 'currency' ||
          column.type === 'number' ||
          column.type === 'percent'
            ? 'right'
            : 'left',
        wrapText: column.width ? column.width >= 30 : false,
      };
    });

    if (report.rows.length) {
      const totalRowNumber = lastDataRow + 1;
      const totalRow = sheet.getRow(totalRowNumber);
      totalRow.getCell(1).value = 'FILTERED TOTAL';
      totalRow.font = { bold: true, color: { argb: 'FF173A63' } };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0F8' },
      };
      report.columns.forEach((column, index) => {
        if (column.type === 'currency' || column.type === 'number') {
          const letter = sheet.getColumn(index + 1).letter;
          totalRow.getCell(index + 1).value = {
            formula: `SUBTOTAL(109,${letter}2:${letter}${lastDataRow})`,
          };
        }
      });
    }
  }

  private result(
    reportType: BillingReportType,
    title: string,
    filters: Record<string, string>,
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
    summary: Record<string, number>,
  ): BillingReportResult {
    return {
      reportType,
      title,
      generatedAt: new Date().toISOString(),
      filters,
      columns,
      rows,
      summary,
    };
  }

  private invoiceSummary(invoices: Invoice[]): Record<string, number> {
    return {
      invoiceCount: invoices.length,
      clientCount: new Set(invoices.map((invoice) => invoice.billingClientId))
        .size,
      taxableValue: this.sum(invoices, 'taxableValue'),
      gstAmount: invoices.reduce(
        (sum, invoice) =>
          sum +
          this.num(invoice.cgstAmount) +
          this.num(invoice.sgstAmount) +
          this.num(invoice.igstAmount),
        0,
      ),
      billedAmount: this.sum(invoices, 'grandTotal'),
      receivedAmount: this.sum(invoices, 'amountReceived'),
      outstandingAmount: this.sum(invoices, 'balanceOutstanding'),
    };
  }

  private sum(invoices: Invoice[], key: keyof Invoice): number {
    return this.round(
      invoices.reduce((sum, invoice) => sum + this.num(invoice[key]), 0),
    );
  }

  private parseReportType(value?: string): BillingReportType {
    const type = (value || 'GST_DETAIL').toUpperCase() as BillingReportType;
    if (!REPORT_TYPES.has(type)) {
      throw new BadRequestException(
        `Unsupported billing report type: ${value}`,
      );
    }
    return type;
  }

  private col(
    key: string,
    label: string,
    type: ReportColumn['type'] = 'text',
    width = 18,
  ): ReportColumn {
    return { key, label, type, width };
  }

  private unique(values?: Array<string | null | undefined>): string {
    return [
      ...new Set((values || []).map((value) => value?.trim()).filter(Boolean)),
    ].join('; ');
  }

  private overdueDays(dueDate?: string | null): number {
    if (!dueDate) return 0;
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(
      0,
      Math.floor((today.getTime() - due.getTime()) / 86400000),
    );
  }

  private agingBucket(dueDate?: string | null): string {
    if (!dueDate) return 'No due date';
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due >= today) return 'Not due';
    const days = this.overdueDays(dueDate);
    if (days <= 30) return '1-30 days';
    if (days <= 60) return '31-60 days';
    if (days <= 90) return '61-90 days';
    return '90+ days';
  }

  private safeText(value: unknown): string {
    const text = this.textValue(value);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  }

  private textValue(value: unknown): string {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return `${value}`;
    }
    return JSON.stringify(value);
  }

  private humanize(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private num(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
