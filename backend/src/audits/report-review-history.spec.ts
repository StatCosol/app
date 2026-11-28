import {
  normalizeReportRemarks,
  transitionGovernedReport,
} from './report-governance';
import { archiveIssuedReport } from './issued-report';

jest.mock('./issued-report', () => ({ archiveIssuedReport: jest.fn() }));

describe('Persisted report review decisions', () => {
  function setup(status = 'SUBMITTED') {
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT audit_id')) return [{ audit_id: 'audit' }];
      if (sql.includes('FROM audit_reports WHERE id=$1 FOR UPDATE'))
        return [{ id: 'report', status, held_at: null }];
      return [{ id: 'report' }];
    });
    const transaction = jest.fn(async (fn: any) => fn({ query }));
    return { query, transaction, ds: { transaction } as any };
  }
  beforeEach(() => jest.clearAllMocks());
  it.each([42, {}, ['remark'], 'x'.repeat(2001)])(
    'rejects invalid remarks before writes',
    async (remarks) => {
      const t = setup();
      await expect(
        transitionGovernedReport(
          t.ds,
          { id: 'report', status: 'SUBMITTED' },
          'approve',
          'reviewer',
          remarks as any,
        ),
      ).rejects.toThrow('2000');
      expect(t.transaction).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, null, '', '   '])(
    'normalizes optional remarks %p',
    (value) => {
      expect(normalizeReportRemarks(value)).toBeNull();
    },
  );
  it('saves trimmed approval remarks with reviewer and report identity inside the transaction', async () => {
    const t = setup();
    await transitionGovernedReport(
      t.ds,
      { id: 'report', status: 'SUBMITTED' },
      'approve',
      'reviewer',
      '  Evidence checked\nReady for publication  ',
    );
    expect(t.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      ['report', 'reviewer', 'Evidence checked\nReady for publication'],
    );
    expect(t.query).toHaveBeenCalledWith(
      expect.stringContaining("'revision',version_no"),
      expect.any(Array),
    );
    expect(archiveIssuedReport).not.toHaveBeenCalled();
  });
  it('does not swallow a decision-log failure after publication', async () => {
    const t = setup('APPROVED');
    const original = t.query.getMockImplementation()!;
    t.query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO audit_logs'))
        throw new Error('Review storage failed');
      return original(sql);
    });
    await expect(
      transitionGovernedReport(
        t.ds,
        { id: 'report', status: 'APPROVED' },
        'publishCrm',
        'reviewer',
        'Published after review',
      ),
    ).rejects.toThrow('Review storage failed');
    expect(archiveIssuedReport).toHaveBeenCalled();
  });
});
