import { changeAuditSchedule } from './audit-schedule-actions';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

function setup(status = 'PLANNED') {
  const audit: any = {
    id: 'audit',
    client_id: 'client',
    status,
    notes: 'Original note',
    schedule_id: 'slot',
  };
  let reports: any[] = [],
    activity: any[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM audits')) return [audit];
    if (sql.startsWith('SELECT status FROM audit_reports')) return reports;
    if (sql.includes('UNION ALL')) return activity;
    return [];
  });
  const manager = { query };
  const db = { transaction: jest.fn((fn) => fn(manager)) } as any;
  const assigned = jest.fn(async () => true);
  const user: any = { roleCode: 'CRM', userId: 'crm' };
  const run = (
    action: 'DELETE' | 'CANCEL' = 'CANCEL',
    reason = 'TEST ONLY duplicate schedule',
  ) => changeAuditSchedule(db, user, 'audit', action, reason, assigned);
  return {
    audit,
    query,
    user,
    assigned,
    run,
    setReports: (v: any[]) => (reports = v),
    setActivity: (v: any[]) => (activity = v),
  };
}
describe('Audit schedule actions', () => {
  it.each(['CLIENT', 'BRANCH', 'AUDITOR', 'CONTRACTOR'])(
    'denies %s schedule mutation',
    async (role) => {
      const t = setup();
      t.user.roleCode = role;
      await expect(t.run()).rejects.toThrow(ForbiddenException);
      expect(t.query).not.toHaveBeenCalled();
    },
  );
  it('denies CRM outside assigned clients', async () => {
    const t = setup();
    t.assigned.mockResolvedValue(false);
    await expect(t.run()).rejects.toThrow(ForbiddenException);
    expect(t.query.mock.calls.some(([s]) => s.startsWith('UPDATE'))).toBe(
      false,
    );
  });
  it.each(['', 'no', 'x'.repeat(2001)])(
    'requires a bounded reason (%s)',
    async (reason) => {
      const t = setup();
      await expect(t.run('CANCEL', reason)).rejects.toThrow(
        BadRequestException,
      );
      expect(t.query).not.toHaveBeenCalled();
    },
  );
  it.each(['PLANNED', 'IN_PROGRESS'])(
    'cancels %s preserving records and synchronizing calendar/locks',
    async (status) => {
      const t = setup(status);
      expect(await t.run()).toEqual({ id: 'audit', status: 'CANCELLED' });
      expect(t.query).toHaveBeenCalledWith(
        expect.stringContaining('upload_lock_from=NULL'),
        ['audit', expect.stringContaining('Cancellation reason:')],
      );
      expect(t.query).toHaveBeenCalledWith(
        expect.stringContaining(
          "UPDATE audit_schedules SET status='CANCELLED'",
        ),
        ['slot'],
      );
      expect(t.query.mock.calls.some(([s]) => s.startsWith('DELETE'))).toBe(
        false,
      );
      const log = t.query.mock.calls.find(([s]) =>
        s.startsWith('INSERT INTO audit_logs'),
      ) as any;
      expect(JSON.parse(log[1][2]).before.notes).toBe('Original note');
    },
  );
  it.each([
    'CLOSED',
    'COMPLETED',
    'SUBMITTED',
    'CORRECTION_PENDING',
    'REVERIFICATION_PENDING',
    'CANCELLED',
  ])('blocks cancel/delete on %s', async (status) => {
    const t = setup(status);
    await expect(t.run()).rejects.toThrow(BadRequestException);
    await expect(t.run('DELETE')).rejects.toThrow(BadRequestException);
  });
  it.each(['SUBMITTED', 'APPROVED', 'PUBLISHED'])(
    'protects %s reports even if audit still says in progress',
    async (status) => {
      const t = setup('IN_PROGRESS');
      t.setReports([{ status }]);
      await expect(t.run()).rejects.toThrow('report');
    },
  );
  it('deletes only an unused planned audit, with snapshot and calendar cancellation in transaction', async () => {
    const t = setup();
    expect(await t.run('DELETE')).toEqual({ id: 'audit', status: 'DELETED' });
    expect(t.query).toHaveBeenCalledWith(
      'SELECT * FROM audits WHERE id=$1 FOR UPDATE',
      ['audit'],
    );
    expect(t.query).toHaveBeenCalledWith('DELETE FROM audits WHERE id=$1', [
      'audit',
    ]);
    expect(
      t.query.mock.calls.some(([s]) =>
        s.includes('DELETE FROM contractor_documents'),
      ),
    ).toBe(false);
  });
  it('refuses deletion when any linked work exists', async () => {
    const t = setup();
    t.setActivity([{}]);
    await expect(t.run('DELETE')).rejects.toThrow('preserve');
    expect(t.query.mock.calls.some(([s]) => s.startsWith('DELETE'))).toBe(
      false,
    );
  });
  it('protects draft reports and a started audit from deletion', async () => {
    const t = setup();
    t.setReports([{ status: 'DRAFT' }]);
    await expect(t.run('DELETE')).rejects.toThrow('preserve');
    await expect(setup('IN_PROGRESS').run('DELETE')).rejects.toThrow(
      'unused planned',
    );
  });
});
