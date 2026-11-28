import { AuditorDashboardController } from './auditor-dashboard.controller';
import { AUDITOR_REPORTS_SQL } from './sql/auditor-dashboard.sql';

describe('Auditor dashboard activity and reports', () => {
  it('names the audit and client for each activity, only for the auditor’s own audits', async () => {
    const rows = [{ id: 1, description: 'NC_ACCEPTED', auditName: 'AUD-1' }];
    const query = jest.fn().mockResolvedValue(rows);
    const controller = new AuditorDashboardController(
      {} as any,
      {
        query,
      } as any,
    );
    const result = await controller.getActivity({ id: 'auditor-1' } as any);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['auditor-1']);
    expect(sql).toContain('WHERE al.performed_by = $1');
    // NC and observation events resolve to their audit.
    expect(sql).toContain(
      "al.entity_type = 'AUDIT_NC' AND nc.id = al.entity_id",
    );
    expect(sql).toContain('COALESCE(nc.audit_id, ob.audit_id, al.entity_id)');
    // Another auditor's audit is never named.
    expect(sql).toContain('a.assigned_auditor_id = $1');
    expect(sql).toContain('AS "auditName"');
    expect(sql).toContain('AS "clientName"');
    expect(result).toEqual({ items: rows });
  });

  it('returns the latest report status so the list can lock Edit report', () => {
    expect(AUDITOR_REPORTS_SQL).toContain('AS "reportStatus"');
    expect(AUDITOR_REPORTS_SQL).toContain('AS "reportHeld"');
    expect(AUDITOR_REPORTS_SQL).toMatch(
      /ORDER BY r\.updated_at DESC, r\.created_at DESC\s+LIMIT 1/,
    );
  });
});
