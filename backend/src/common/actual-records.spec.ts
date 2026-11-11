import {
  actualAuditSql,
  actualContractorDocumentSql,
  LEGACY_TEST_AUDIT_CODES,
} from './actual-records';
import {
  AUDITOR_SUMMARY_SQL,
  AUDITOR_AUDITS_SQL,
  AUDITOR_OBSERVATIONS_SQL,
  AUDITOR_REPORTS_SQL,
} from '../auditor/sql/auditor-dashboard.sql';

describe('operational test isolation', () => {
  it.each([
    'TEST-RECON-bank.xlsx',
    'test_upload.pdf',
    'SYNTHETIC TEST ONLY bank proof',
  ])('excludes explicit fixture %s', (value) => {
    const patterns = Array.from(
      actualContractorDocumentSql().matchAll(/!~\* '([^']+)'/g),
      (m) => m[1],
    );
    expect(
      patterns.some((pattern) => new RegExp(pattern, 'i').test(value)),
    ).toBe(true);
  });
  it.each([
    'latest.pdf',
    'Lab test certificate.pdf',
    'Test certificate.pdf',
    'testimony.pdf',
    'Annual audit 2099',
    '',
  ])('retains ordinary records %s', (value) => {
    const patterns = Array.from(
      actualContractorDocumentSql().matchAll(/!~\* '([^']+)'/g),
      (m) => m[1],
    );
    expect(
      patterns.some((pattern) => new RegExp(pattern, 'i').test(value)),
    ).toBe(false);
  });
  it('targets the verified legacy fixtures without excluding an entire year', () => {
    expect(LEGACY_TEST_AUDIT_CODES).toHaveLength(13);
    expect(actualAuditSql()).toContain('branch_id IS NOT DISTINCT FROM');
    expect(actualAuditSql()).not.toContain('period_year');
    expect(actualAuditSql()).not.toContain('review_notes');
  });
  it('keeps summary, queues, observations and reports on the same actual scope', () => {
    for (const sql of [
      AUDITOR_SUMMARY_SQL,
      AUDITOR_AUDITS_SQL,
      AUDITOR_OBSERVATIONS_SQL,
      AUDITOR_REPORTS_SQL,
    ]) {
      expect(sql).toContain(actualAuditSql());
      expect(sql).toContain('a.assigned_auditor_id = $1');
    }
  });
  it('rejects dynamic SQL aliases', () =>
    expect(() => actualAuditSql('a;DROP')).toThrow());
});
