import { AdminReportsController } from './admin-reports.controller';
jest.mock('../audits/issued-report', () => ({
  archiveIssuedReport: jest.fn().mockResolvedValue(undefined),
}));

describe('Admin audit report hold invariant', () => {
  const user = { userId: 'admin', roleCode: 'ADMIN' } as any;
  function setup(status: string, held = false) {
    const report = {
      id: 'report',
      audit_id: 'audit',
      status,
      held_at: held ? new Date() : null,
    };
    const query = jest.fn(async (_sql: string, _params?: any[]) => [report]);
    return {
      controller: new AdminReportsController({
        query,
        transaction: (fn: any) => fn({ query }),
      } as any),
      query,
      report,
    };
  }

  it.each(['approve', 'publish'])(
    'rejects %s while held before writing',
    async (action) => {
      const { controller, query } = setup(
        action === 'approve' ? 'SUBMITTED' : 'APPROVED',
        true,
      );
      const run =
        action === 'approve'
          ? controller.approveAuditReport('report', user)
          : controller.publishAuditReport('report');
      await expect(run).rejects.toThrow('Release the report hold first');
      expect(
        query.mock.calls.some(([sql]) => sql.startsWith('WITH changed')),
      ).toBe(false);
    },
  );

  it.each(['approve', 'publish'])(
    'conditionally updates %s only while not held and in the expected state',
    async (action) => {
      const status = action === 'approve' ? 'SUBMITTED' : 'APPROVED';
      const { controller, query } = setup(status);
      const run =
        action === 'approve'
          ? controller.approveAuditReport('report', user)
          : controller.publishAuditReport('report');
      await expect(run).resolves.toMatchObject({ ok: true });
      const sql = query.mock.calls.find(([sql]) =>
        sql.startsWith('WITH changed'),
      )![0];
      expect(sql).toContain('WITH changed AS');
      expect(sql).toContain('held_at IS NULL');
      expect(sql).toContain(`AND status = '${status}'`);
      expect(sql).toContain('SELECT id FROM changed');
    },
  );

  it.each(['approve', 'publish'])(
    'rejects a concurrent hold/status change during %s',
    async (action) => {
      const { controller, query, report } = setup(
        action === 'approve' ? 'SUBMITTED' : 'APPROVED',
      );
      query.mockImplementation(async (sql) =>
        sql.startsWith('WITH changed') ? [] : [report],
      );
      const run =
        action === 'approve'
          ? controller.approveAuditReport('report', user)
          : controller.publishAuditReport('report');
      await expect(run).rejects.toThrow('Report changed');
    },
  );

  it.each(['approve', 'publish'])(
    'preserves status restrictions for %s',
    async (action) => {
      const { controller, query } = setup('DRAFT');
      const run =
        action === 'approve'
          ? controller.approveAuditReport('report', user)
          : controller.publishAuditReport('report');
      await expect(run).rejects.toThrow('Only');
      expect(
        query.mock.calls.some(([sql]) => sql.startsWith('WITH changed')),
      ).toBe(false);
    },
  );
});
