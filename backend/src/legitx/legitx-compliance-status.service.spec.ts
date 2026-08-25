import { LegitxComplianceStatusService } from './legitx-compliance-status.service';

describe('LegitxComplianceStatusService overview', () => {
  it('combines monthly tasks and returns into the client dashboard summary', async () => {
    const service = new LegitxComplianceStatusService({} as any);

    jest.spyOn(service, 'getSummary').mockResolvedValue({
      overallCompliancePct: 75,
      totalBranches: 2,
      totalApplicable: 8,
      approved: 6,
      pending: 1,
      overdue: 1,
      rejected: 0,
      inReview: 0,
      criticalNonCompliances: 0,
      riskLevel: 'MEDIUM',
    });
    jest.spyOn(service, 'getReturnsStatus').mockResolvedValue({
      summary: { total: 2, filed: 1, pending: 0, overdue: 1, rejected: 0 },
      data: [
        {
          id: 'return-1',
          return_type: 'PF ECR',
          law_type: 'PF',
          branch_name: 'Unit 1',
          period_label: 'Aug 2026',
          due_date: '2026-08-15',
          status: 'OVERDUE',
          filed_date: null,
          delay_days: 3,
        },
      ],
    });
    jest.spyOn(service, 'getContractorImpact').mockResolvedValue({
      leastCompliant: [],
      mostCompliant: [],
    });
    jest.spyOn(service, 'getAuditImpact').mockResolvedValue({
      lastAuditDate: null,
      overallAuditScore: 0,
      totalAudits: 0,
      completedAudits: 0,
      openObservations: 0,
      criticalObservations: 0,
      highObservations: 0,
      reverifyPending: 0,
      observations: [],
    });
    jest.spyOn(service as any, 'getComplianceAreas').mockResolvedValue([]);
    jest.spyOn(service as any, 'getComplianceTrend').mockResolvedValue([]);
    jest.spyOn(service as any, 'getRegistrationExpiries').mockResolvedValue([]);
    jest
      .spyOn(service as any, 'getExpiredRegistrationCount')
      .mockResolvedValue(0);
    const getTasks = jest
      .spyOn(service, 'getTasks')
      .mockImplementation(async (params: any) =>
        params.status === 'OVERDUE'
          ? [
              {
                taskId: 1,
                complianceCode: null,
                title: 'ESI contribution',
                lawName: 'ESI',
                frequency: 'MONTHLY',
                status: 'OVERDUE',
                dueDate: '2026-08-15',
                delayDays: 3,
                branchId: 'branch-1',
                branchName: 'Unit 1',
                remarks: null,
              },
            ]
          : [],
      );

    const result = await service.getOverview({
      month: 8,
      year: 2026,
      clientId: 'client-1',
      allowedBranchIds: 'ALL',
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        totalApplicable: 10,
        complied: 7,
        pending: 1,
        overdue: 2,
        overallCompliancePct: 70,
        criticalIssues: 2,
      }),
    );
    expect(result.actionItems).toHaveLength(2);
    expect(result.actionItems.map((item) => item.title)).toEqual([
      'ESI contribution',
      'PF ECR',
    ]);
    expect(getTasks).toHaveBeenCalledWith(
      expect.objectContaining({ upcomingOnly: true, limit: 8 }),
    );
  });

  it('applies the selected branch to every audit query', async () => {
    const db = {
      one: jest
        .fn()
        .mockResolvedValueOnce({
          total: 0,
          completed: 0,
          avg_score: 0,
          last_audit_date: null,
        })
        .mockResolvedValueOnce({
          open_count: 0,
          critical_count: 0,
          high_count: 0,
          reverify_count: 0,
        }),
      many: jest.fn().mockResolvedValue([]),
    };
    const service = new LegitxComplianceStatusService(db as any);

    await service.getAuditImpact({
      month: 8,
      year: 2026,
      clientId: 'client-1',
      branchId: 'branch-1',
    });

    expect(db.one).toHaveBeenCalledTimes(2);
    expect(db.many).toHaveBeenCalledTimes(1);
    for (const [sql, params] of [...db.one.mock.calls, ...db.many.mock.calls]) {
      expect(sql).toContain('a.branch_id = $3');
      expect(params).toEqual([2026, 'client-1', 'branch-1']);
    }
  });

  it('filters and orders upcoming tasks before applying the row limit', async () => {
    const db = { many: jest.fn().mockResolvedValue([]) };
    const service = new LegitxComplianceStatusService(db as any);

    await service.getTasks({
      month: 8,
      year: 2026,
      clientId: 'client-1',
      upcomingOnly: true,
      limit: 8,
      offset: 0,
    });

    const [sql, params] = db.many.mock.calls[0];
    expect(sql).toContain('ct.due_date >= CURRENT_DATE');
    expect(sql).toContain("ct.status NOT IN ('APPROVED','NOT_APPLICABLE')");
    expect(sql).toMatch(/ORDER BY\s+ct\.due_date ASC NULLS LAST/);
    expect(params).toEqual([2026, 8, 'client-1', 8, 0]);
  });

  it('counts expired registrations with an uncapped scoped aggregate', async () => {
    const db = { one: jest.fn().mockResolvedValue({ count: 31 }) };
    const service = new LegitxComplianceStatusService(db as any);

    const count = await (service as any).getExpiredRegistrationCount({
      month: 8,
      year: 2026,
      clientId: 'client-1',
      allowedBranchIds: ['branch-1'],
    });

    expect(count).toBe(31);
    expect(db.one.mock.calls[0][0]).not.toContain('LIMIT');
    expect(db.one.mock.calls[0][0]).toContain('br.branch_id = ANY($4::uuid[])');
    expect(db.one.mock.calls[0][1]).toEqual([
      2026,
      8,
      'client-1',
      ['branch-1'],
    ]);
  });
});
