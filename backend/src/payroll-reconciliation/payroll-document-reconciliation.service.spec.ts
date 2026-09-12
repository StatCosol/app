import { PayrollDocumentReconciliationService } from './payroll-document-reconciliation.service';
import { runLocalOcr } from './local-ocr';
import { PDFParse } from 'pdf-parse';
import { ocrRows } from './ocr-table';

jest.mock('./local-ocr', () => ({ runLocalOcr: jest.fn() }));
jest.mock('node:fs/promises', () => ({
  realpath: jest.fn((p: string) => Promise.resolve(p)),
  stat: jest.fn(async () => ({ size: 10 })),
  readFile: jest.fn(async () => Buffer.from('pdf')),
}));
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
const tsv = (words: Array<[string, number, number]>) =>
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' +
  words
    .map(([text, x, y]) => `5\t1\t1\t1\t1\t1\t${x}\t${y}\t60\t20\t95\t${text}`)
    .join('\n');
const page = {
  page: 1,
  text: 'UAN PF Wage PF Deduction',
  confidence: 95,
  tsv: tsv([
    ['UAN', 10, 10],
    ['PF', 200, 10],
    ['Wage', 230, 10],
    ['PF', 400, 10],
    ['Deduction', 440, 10],
    ['100000000001', 10, 50],
    ['15000', 200, 50],
    ['1800', 400, 50],
  ]),
};
describe('PDF coverage and OCR checks', () => {
  let query: jest.Mock;
  let parser: any;
  let service: PayrollDocumentReconciliationService;
  beforeEach(() => {
    jest.clearAllMocks();
    parser = {
      getInfo: jest.fn(async () => ({ total: 1 })),
      getTable: jest.fn(async () => ({
        pages: [
          {
            num: 1,
            tables: [
              [
                ['UAN', 'PF Wage', 'PF Deduction'],
                ['100000000001', '15000', '1800'],
              ],
            ],
          },
        ],
      })),
      destroy: jest.fn(),
    };
    (PDFParse as unknown as jest.Mock).mockImplementation(() => parser);
    query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM contractor_documents'))
        return [
          {
            id: 'doc',
            file_name: 'pf.pdf',
            file_path: 'pf.pdf',
            doc_type: 'PF',
            doc_month: '2026-09',
          },
        ];
      if (sql.startsWith('SELECT * FROM contractor_payroll_versions'))
        return [
          {
            id: 'v1',
            version: 1,
            rows_snapshot: [
              {
                employeeCode: 'E1',
                pfWage: 15000,
                pfDeduction: 1800,
                calculationSnapshot: {
                  uan: '100000000001',
                  pfApplicable: true,
                  esiApplicable: false,
                },
              },
            ],
          },
        ];
      return [];
    });
    service = new PayrollDocumentReconciliationService({ query } as any);
    (runLocalOcr as jest.Mock).mockResolvedValue([page]);
  });
  it('recognizes plain PF documents and records the new table check profile', async () => {
    expect((await service.check('doc')).status).toBe('MATCHED');
    expect(
      query.mock.calls.find(([sql]) => sql.startsWith('SELECT result'))?.[1][4],
    ).toBe('tables-v2');
    expect(runLocalOcr).not.toHaveBeenCalled();
  });
  it('does not declare a mixed readable/scanned PDF matched', async () => {
    parser.getInfo.mockResolvedValue({ total: 2 });
    const result = await service.check('doc');
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.findings.some((f: any) => f.field === 'coverage')).toBe(true);
    expect(runLocalOcr).not.toHaveBeenCalled();
  });
  it('runs OCR on an auditor comparison and never automatically marks it matched', async () => {
    parser.getTable.mockResolvedValue({ pages: [] });
    const result = await service.check('doc', { ocr: true });
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.extraction).toBe('OCR');
    expect(result.ocr.rows).toBe(1);
    expect(result.checkProfile).toBe('ocr-v1');
    expect(result.findings.every((f: any) => f.status === 'NEEDS_REVIEW')).toBe(
      true,
    );
    expect(
      query.mock.calls.find(([sql]) => sql.startsWith('INSERT'))?.[1][6],
    ).toBe('ocr-v1');
  });
  it('does not persist a busy or timed-out OCR result, allowing a retry', async () => {
    parser.getTable.mockResolvedValue({ pages: [] });
    (runLocalOcr as jest.Mock).mockRejectedValue(new Error('busy'));
    expect((await service.check('doc', { ocr: true })).status).toBe(
      'NEEDS_REVIEW',
    );
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
      false,
    );
  });
  it('does not OCR a completely extracted PDF unnecessarily', async () => {
    expect((await service.check('doc', { ocr: true })).status).toBe('MATCHED');
    expect(runLocalOcr).not.toHaveBeenCalled();
  });
  it('does not save a result if payroll changes during extraction', async () => {
    const original = query.getMockImplementation()!;
    let reads = 0;
    query.mockImplementation(async (sql: string) => {
      const result = await original(sql);
      if (
        sql.startsWith('SELECT * FROM contractor_payroll_versions') &&
        ++reads > 1
      )
        return [{ ...result[0], id: 'v2' }];
      return result;
    });
    const result = await service.check('doc');
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.findings[0].remark).toContain('Payroll changed');
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
      false,
    );
  });
  it('keeps identifiers exactly as OCR reads them rather than correcting digits', () => {
    const rows = ocrRows([
      { ...page, tsv: page.tsv.replace('100000000001', '1O0000000001') },
    ]);
    expect(rows[0].uan).toBe('1O0000000001');
    expect(rows[0]._page).toBe('1');
  });
  it('refuses ambiguous duplicate column headers', () => {
    const rows = ocrRows([
      {
        ...page,
        tsv: tsv([
          ['UAN', 10, 10],
          ['UAN', 200, 10],
          ['100000000001', 10, 50],
          ['15000', 200, 50],
        ]),
      },
    ]);
    expect(rows).toEqual([]);
  });
});
