import { AdminReportsController } from './admin-reports.controller';

describe('Admin audit report hold invariant', () => {
  const user = { userId: 'admin', roleCode: 'ADMIN' } as any;
  function setup(status: string, held = false) {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'report', status, held_at: held ? new Date() : null },
      ])
      .mockResolvedValue([{ id: 'report' }]);
    return { controller: new AdminReportsController({ query } as any), query };
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
      expect(query).toHaveBeenCalledTimes(1);
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
      const sql = query.mock.calls[1][0];
      expect(sql).toContain('WITH changed AS');
      expect(sql).toContain('held_at IS NULL');
      expect(sql).toContain(`AND status = '${status}'`);
      expect(sql).toContain('SELECT id FROM changed');
    },
  );

  it.each(['approve', 'publish'])(
    'rejects a concurrent hold/status change during %s',
    async (action) => {
      const { controller, query } = setup(
        action === 'approve' ? 'SUBMITTED' : 'APPROVED',
      );
      query.mockResolvedValue([]);
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
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
});
