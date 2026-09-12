import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  comparePayrollDocument,
  DocumentRow,
  normalizeHeader,
} from './document-comparison';

@Injectable()
export class PayrollDocumentReconciliationService {
  constructor(private readonly db: DataSource) {}
  async checkPeriod(
    clientId: string,
    branchId: string,
    contractorId: string,
    month: string,
  ) {
    const documents = await this.db.query(
      'SELECT id FROM contractor_documents WHERE client_id=$1 AND branch_id=$2 AND contractor_user_id=$3 AND doc_month=$4',
      [clientId, branchId, contractorId, month],
    );
    for (const doc of documents) await this.check(doc.id);
  }
  async check(documentId: string) {
    const [doc] = await this.db.query(
      'SELECT * FROM contractor_documents WHERE id=$1',
      [documentId],
    );
    if (!doc) throw new Error('Document not found');
    const [payroll] = await this.db.query(
      'SELECT * FROM contractor_payroll_versions WHERE client_id=$1 AND branch_id=$2 AND contractor_user_id=$3 AND period_month=$4 AND is_current',
      [doc.client_id, doc.branch_id, doc.contractor_user_id, doc.doc_month],
    );
    const root = await realpath(path.resolve(process.cwd(), 'uploads'));
    const candidate = await realpath(path.resolve(root, doc.file_path));
    if (!candidate.startsWith(root + path.sep))
      throw new Error('Document path is outside uploads');
    if ((await stat(candidate)).size > 10 * 1024 * 1024)
      throw new Error('Document exceeds 10 MB');
    const buffer = await readFile(candidate),
      hash = createHash('sha256').update(buffer).digest('hex');
    const [cached] = await this.db.query(
      'SELECT result FROM payroll_document_checks WHERE document_id=$1 AND file_hash=$2 AND payroll_version_id IS NOT DISTINCT FROM $3::uuid AND file_path=$4 ORDER BY created_at DESC LIMIT 1',
      [documentId, hash, payroll?.id || null, doc.file_path],
    );
    if (cached) return cached.result;
    let result: any;
    const review = (remark: string) => ({
      status: 'NEEDS_REVIEW',
      findings: [{ status: 'NEEDS_REVIEW', field: 'document', remark }],
    });
    if (!payroll)
      result = review(
        'Generate payroll from branch-approved attendance before comparison',
      );
    else if (/CHALLAN|PAYMENT|BANK/i.test(doc.doc_type))
      result = review(
        'Verify establishment, payment period and multi-site coverage manually before comparing totals',
      );
    else {
      const kind = /ECR|EPF|PF_/i.test(doc.doc_type)
        ? 'PF'
        : /ESI/i.test(doc.doc_type)
          ? 'ESI'
          : /WAGE|SALARY/i.test(doc.doc_type)
            ? 'WAGE'
            : /ATTENDANCE|MUSTER/i.test(doc.doc_type)
              ? 'ATTENDANCE'
              : null;
      if (!kind)
        result = review('This document type requires manual auditor review');
      else
        try {
          let rows: DocumentRow[] = [];
          const add = (table: string[][], page: number) => {
            const headerIndex = table.findIndex((row) =>
              row.some((cell) =>
                ['employeeCode', 'uan', 'esic'].includes(normalizeHeader(cell)),
              ),
            );
            if (headerIndex < 0) return;
            const headers = table[headerIndex].map(normalizeHeader);
            const anchor =
              kind === 'PF'
                ? 'pfDeduction'
                : kind === 'ESI'
                  ? 'esiDeduction'
                  : kind === 'ATTENDANCE'
                    ? 'daysWorked'
                    : 'netSalary';
            if (!headers.includes(anchor)) return;
            for (const values of table.slice(headerIndex + 1)) {
              if (!values.some((v) => v.trim())) continue;
              const row = Object.fromEntries(
                headers.map((h, i) => [h, values[i] || '']),
              ) as DocumentRow;
              row._page = String(page);
              rows.push(row);
            }
          };
          if (/\.xlsx$/i.test(doc.file_name)) {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer as any);
            for (const sheet of workbook.worksheets) {
              if (sheet.rowCount > 10001)
                throw new Error('Too many document rows');
              const table: string[][] = [];
              sheet.eachRow((row) => {
                const cells: string[] = [];
                for (let c = 1; c <= Math.min(sheet.columnCount, 100); c++)
                  cells.push(row.getCell(c).text);
                table.push(cells);
              });
              const before = rows.length;
              add(table, 0);
              const header = table.find((r) =>
                r.some((c) =>
                  ['employeeCode', 'uan', 'esic'].includes(normalizeHeader(c)),
                ),
              );
              if (header) {
                const columns = header
                  .map(normalizeHeader)
                  .map((h, i) => (['uan', 'esic'].includes(h) ? i + 1 : 0))
                  .filter(Boolean);
                let numericIdentifier = false;
                sheet.eachRow((row) => {
                  if (
                    columns.some(
                      (c) => typeof row.getCell(c).value === 'number',
                    )
                  )
                    numericIdentifier = true;
                });
                if (numericIdentifier)
                  for (const row of rows.slice(before))
                    row._uncertainIdentifier = 'true';
              }
            }
          } else if (/\.pdf$/i.test(doc.file_name)) {
            const parser = new PDFParse({ data: new Uint8Array(buffer) });
            try {
              const info = await parser.getInfo();
              if (info.total > 100) throw new Error('Too many PDF pages');
              const tables = await parser.getTable();
              for (const page of tables.pages)
                for (const table of page.tables) add(table, page.num);
            } finally {
              await parser.destroy();
            }
          } else throw new Error('Unsupported file type');
          if (kind === 'ATTENDANCE' && rows.some((r) => r.attendance_date)) {
            const grouped = new Map<string, DocumentRow>(),
              seenDates = new Set<string>();
            for (const row of rows) {
              const date = row.attendance_date,
                day = Number(row.daysWorked),
                hours = Number(row.overtimeHours || 0);
              if (
                !row.employeeCode ||
                !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
                !Number.isFinite(Date.parse(date)) ||
                new Date(date).toISOString().slice(0, 10) !== date ||
                date.slice(0, 7) !== doc.doc_month ||
                !Number.isFinite(day) ||
                day < 0 ||
                day > 1 ||
                !Number.isFinite(hours) ||
                hours < 0 ||
                hours > 24 ||
                seenDates.has(row.employeeCode + ':' + date)
              )
                throw new Error('Invalid dated attendance');
              seenDates.add(row.employeeCode + ':' + date);
              const group = grouped.get(row.employeeCode) || {
                employeeCode: row.employeeCode,
                daysWorked: '0',
                overtimeHours: '0',
              };
              group.daysWorked = String(Number(group.daysWorked) + day);
              group.overtimeHours = String(Number(group.overtimeHours) + hours);
              grouped.set(row.employeeCode, group);
            }
            rows = [...grouped.values()];
          }
          result = rows.length
            ? comparePayrollDocument(rows, payroll.rows_snapshot, kind)
            : review(
                'No supported table found. Scanned or unfamiliar PDFs require auditor review; no automatic compliance conclusion was made.',
              );
        } catch {
          result = review(
            'Document extraction could not be completed; review the original file manually',
          );
        }
    }
    result = {
      ...result,
      payrollVersionId: payroll?.id || null,
      payrollVersion: payroll?.version || null,
      fileHash: hash,
    };
    await this.db.query(
      'INSERT INTO payroll_document_checks(document_id,file_hash,payroll_version_id,status,result,file_path) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING',
      [
        documentId,
        hash,
        payroll?.id || null,
        result.status,
        JSON.stringify(result),
        doc.file_path,
      ],
    );
    return result;
  }
}
