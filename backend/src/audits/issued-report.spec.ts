import { createHash } from 'crypto';
import { readIssuedReport } from './issued-report';

describe('Issued report downloads', () => {
  it('returns the exact archived bytes without reading mutable audit data', async () => {
    const pdf = Buffer.from('%PDF-test immutable bytes');
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { pdf, sha256: createHash('sha256').update(pdf).digest('hex') },
        ]),
    };
    expect(await readIssuedReport(db, 'report')).toEqual(pdf);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('audit_report_publications'),
      ['report'],
    );
  });
  it('rejects a damaged archive rather than rebuilding an issued report', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { pdf: Buffer.from('corrupted'), sha256: '0'.repeat(64) },
        ]),
    };
    await expect(readIssuedReport(db, 'report')).rejects.toThrow(
      'integrity check failed',
    );
  });
  it('does not silently fabricate a legacy published PDF', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    await expect(readIssuedReport(db, 'legacy')).rejects.toThrow(
      'archived PDF is unavailable',
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
