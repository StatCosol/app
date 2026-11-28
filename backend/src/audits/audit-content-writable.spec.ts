import { auditContentWritable } from './audit-content-writable';

describe('Audit content revision boundaries', () => {
  it.each(['COMPLETED', 'CLOSED', 'CANCELLED'])(
    'keeps %s read-only even with a draft',
    (status) => {
      expect(auditContentWritable(status, { status: 'DRAFT' })).toBe(false);
    },
  );
  it.each(['SUBMITTED', 'APPROVED', 'PUBLISHED'])(
    'locks a %s report even if the audit is in progress',
    (status) => {
      expect(auditContentWritable('IN_PROGRESS', { status })).toBe(false);
    },
  );
  it('allows an explicitly returned draft without resetting its assessment', () => {
    expect(auditContentWritable('SUBMITTED', { status: 'DRAFT' })).toBe(true);
    expect(auditContentWritable('SUBMITTED')).toBe(false);
    expect(
      auditContentWritable('SUBMITTED', {
        status: 'DRAFT',
        held_at: new Date(),
      }),
    ).toBe(false);
  });
});
