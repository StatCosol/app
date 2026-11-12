import { AuditsService } from './audits.service';

describe('Reopening contractor audit scope', () => {
  const user = { userId: 'auditor', roleCode: 'AUDITOR' } as any;
  function setup(
    status: string,
    branch: string | null,
    contractor: string | null,
    type = 'CONTRACTOR',
  ) {
    const audit = {
      id: 'audit',
      status,
      assigned_auditor_id: 'auditor',
      audit_type: type,
      branch_id: branch,
      contractor_user_id: contractor,
      schedule_id: 'schedule',
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM audits ')) return [audit];
      if (sql.startsWith('SELECT * FROM audit_reports '))
        return [{ id: 'published-report' }];
      if (sql.includes('MAX(version_no)')) return [{ next: 2 }];
      return [];
    });
    const service = Object.create(AuditsService.prototype) as AuditsService;
    Object.assign(service, {
      dataSource: { transaction: (fn: any) => fn({ query }) },
      // Even a previously valid read must not override scope under the lock.
      repo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'audit',
          status,
          assignedAuditorId: 'auditor',
          auditType: type,
          branchId: 'branch',
          contractorUserId: 'contractor',
        }),
      },
    });
    return { service, query };
  }
  for (const status of ['COMPLETED', 'CLOSED']) {
    for (const route of ['direct', 'status']) {
      it.each([
        [null, null],
        [null, 'vendor'],
        ['branch', null],
      ])(
        `${status} ${route} blocks incomplete scope (%s, %s) before any report or audit write`,
        async (branch, contractor) => {
          const { service, query } = setup(status, branch, contractor);
          const action =
            route === 'direct'
              ? service.reopenAuditForReaudit(user, 'audit', 'Correct report')
              : service.updateStatus(
                  user,
                  'audit',
                  'IN_PROGRESS',
                  'Correct report',
                );
          await expect(action).rejects.toThrow(
            'Select a branch and contractor',
          );
          expect(query).toHaveBeenCalledTimes(1);
          expect(query).toHaveBeenCalledWith(
            'SELECT * FROM audits WHERE id = $1 FOR UPDATE',
            ['audit'],
          );
        },
      );
      it(`${status} ${route} permits scoped reopening and creates a new report draft`, async () => {
        const { service, query } = setup(status, 'branch', 'vendor');
        const result =
          route === 'direct'
            ? await service.reopenAuditForReaudit(
                user,
                'audit',
                'Correct report',
              )
            : await service.updateStatus(
                user,
                'audit',
                'IN_PROGRESS',
                'Correct report',
              );
        expect(result.status).toBe('IN_PROGRESS');
        expect(result.reportId).toBeTruthy();
        expect(
          query.mock.calls.some(([sql]) =>
            sql.startsWith('INSERT INTO audit_reports'),
          ),
        ).toBe(true);
      });
    }
  }
  it('preserves non-contractor reopening without a contractor', async () => {
    const { service } = setup('CLOSED', 'branch', null, 'FACTORY');
    await expect(
      service.reopenAuditForReaudit(user, 'audit', 'Correct report'),
    ).resolves.toMatchObject({ status: 'IN_PROGRESS' });
  });
});
