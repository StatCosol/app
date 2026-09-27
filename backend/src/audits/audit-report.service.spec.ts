import { AuditReportService } from './audit-report.service';

describe('Audit report closure and holds', () => {
  const auditor = { userId: 'auditor', roleCode: 'AUDITOR' } as any;
  const crm = { userId: 'crm', roleCode: 'CRM' } as any;
  function setup() {
    const audit = {
      id: 'audit',
      clientId: 'client',
      assignedAuditorId: 'auditor',
      status: 'IN_PROGRESS',
    };
    const report = {
      id: 'report',
      status: 'SUBMITTED',
      held_at: null as Date | null,
      hold_remarks: null as string | null,
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema')) return [];
      if (sql.startsWith('WITH changed')) return [{ id: report.id }];
      if (sql.startsWith('UPDATE')) return [];
      return [report];
    });
    const assignment = jest.fn().mockResolvedValue(true);
    const service = new AuditReportService(
      { findOne: jest.fn().mockResolvedValue(audit) } as any,
      {} as any,
      { query } as any,
      { isClientAssignedToCrm: assignment } as any,
    );
    return { service, audit, report, query, assignment };
  }

  it.each(['COMPLETED', 'CLOSED', 'CANCELLED'])(
    'denies author mutations on %s audits',
    async (status) => {
      const t = setup();
      t.audit.status = status;
      await expect(
        t.service.saveReportDraftForAuditor(auditor, 'audit', {}),
      ).rejects.toThrow('completion or closure');
      await expect(
        t.service.finalizeReportForAuditor(auditor, 'audit'),
      ).rejects.toThrow('completed or closed');
      await expect(
        t.service.reopenReportForAuditor(auditor, 'audit'),
      ).rejects.toThrow('completion or closure');
      expect(
        t.query.mock.calls.some(([sql]) => /UPDATE|INSERT/.test(sql)),
      ).toBe(false);
    },
  );

  it('stores hold metadata and exposes it to both audiences on reload', async () => {
    const t = setup();
    await t.service.holdReportForCrm(crm, 'audit', ' Awaiting evidence ');
    expect(t.query).toHaveBeenCalledWith(
      expect.stringContaining('held_by_user_id = $2'),
      ['report', 'crm', 'Awaiting evidence'],
    );
    t.report.held_at = new Date();
    t.report.hold_remarks = 'Awaiting evidence';
    for (const status of [
      await t.service.getReportStatusForCrm(crm, 'audit'),
      await t.service.getReportStatusForAuditor(auditor, 'audit'),
    ]) {
      expect(status).toMatchObject({
        held: true,
        holdRemarks: 'Awaiting evidence',
        stage: 'FINAL',
      });
    }
  });

  it('blocks approval publication and author reopen while held', async () => {
    const t = setup();
    t.report.held_at = new Date();
    await expect(t.service.approveReportForCrm(crm, 'audit')).rejects.toThrow(
      'hold',
    );
    await expect(t.service.publishReportForCrm(crm, 'audit')).rejects.toThrow(
      'hold',
    );
    await expect(
      t.service.reopenReportForAuditor(auditor, 'audit'),
    ).rejects.toThrow('hold');
    expect(
      t.query.mock.calls.some(([sql]) => sql.startsWith('WITH changed')),
    ).toBe(false);
  });

  it.each([
    'approveReportForCrm',
    'publishReportForCrm',
    'holdReportForCrm',
    'sendBackReportForCrm',
    'reopenReportForAuditor',
  ] as const)('detects concurrent changes in %s', async (method) => {
    const t = setup();
    t.query.mockImplementation(async (sql) =>
      sql.startsWith('WITH changed') || sql.includes('information_schema')
        ? []
        : [t.report],
    );
    await expect(
      t.service[method](
        method === 'reopenReportForAuditor' ? auditor : crm,
        'audit',
        'Reason',
      ),
    ).rejects.toThrow('Report changed');
  });

  it('clears all hold fields on release and send-back', async () => {
    const t = setup();
    await t.service.releaseReportHoldForCrm(crm, 'audit');
    expect(t.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'held_at = NULL, held_by_user_id = NULL, hold_remarks = NULL',
      ),
      ['audit'],
    );
    await t.service.sendBackReportForCrm(crm, 'audit', 'Evidence incomplete');
    expect(t.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'held_at = NULL, held_by_user_id = NULL, hold_remarks = NULL',
      ),
      ['report'],
    );
  });

  it('denies unassigned CRM hold release without touching report storage', async () => {
    const t = setup();
    t.assignment.mockResolvedValue(false);
    await expect(
      t.service.releaseReportHoldForCrm(crm, 'audit'),
    ).rejects.toThrow('not assigned');
    expect(t.query).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PUBLISHED'])(
    'does not hold a %s report',
    async (status) => {
      const t = setup();
      t.report.status = status;
      await expect(t.service.holdReportForCrm(crm, 'audit')).rejects.toThrow(
        'Only SUBMITTED/APPROVED',
      );
    },
  );
});
