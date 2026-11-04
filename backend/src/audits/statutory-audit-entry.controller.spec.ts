import { Workbook } from 'exceljs';
import { StatutoryAuditEntryController } from './statutory-audit-entry.controller';

describe('Audit entry exports', () => {
  async function exportRows(ncOnly: string) {
    const items = ['accepted', 'nc', 'changed'].map((id, index) => ({
      id,
      category: 'Factory',
      serial: index + 1,
      description: '=A1',
      maxMarks: 3,
    }));
    const read = jest.fn().mockResolvedValue({
      session: {
        auditee_name: 'Auditee',
        audit_mode: 'ONLINE',
        categories: ['Factory'],
      },
      items,
      answers: [
        { item_id: 'accepted', status: 'COMPLIED', answer: 'Verified' },
        {
          item_id: 'nc',
          status: 'NON_COMPLIED',
          remarks: 'Missing signed record',
        },
        {
          item_id: 'changed',
          status: 'COMPLIED',
          answer: 'Old conclusion',
          stale: true,
        },
      ],
      evidence: [],
      documents: [
        {
          item_id: 'changed',
          filename: 'replacement.pdf',
          revision: 2,
          review_status: 'PENDING',
        },
      ],
    });
    const res = { setHeader: jest.fn(), send: jest.fn() };
    await new StatutoryAuditEntryController({ read } as any).export(
      { userId: 'auditor' } as any,
      'audit',
      ncOnly,
      res as any,
    );
    const book = new Workbook();
    await book.xlsx.load(res.send.mock.calls[0][0]);
    return book.worksheets[0];
  }
  it('exports online document context and does not score stale findings as compliant', async () => {
    const sheet = await exportRows('false');
    expect(sheet.rowCount).toBe(6);
    expect(sheet.getCell('F1').value).toBe('ONLINE');
    expect(sheet.getCell('K6').value).toBe('REVIEW_REQUIRED');
    expect(sheet.getCell('N6').value).toBeNull();
    expect(sheet.getCell('Q6').value).toBe('replacement.pdf');
    expect(sheet.getCell('R6').value).toBe(2);
    // Imported descriptions must remain plain strings, even if Excel-like.
    expect(sheet.getCell('G4').value).toBe('=A1');
  });
  it('exports only current non-compliant findings in the NC workbook', async () => {
    const sheet = await exportRows('true');
    expect(sheet.rowCount).toBe(4);
    expect(sheet.getCell('K4').value).toBe('NON_COMPLIED');
    expect(sheet.getCell('L4').value).toBe('Missing signed record');
  });
});
