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
    jest.spyOn(service, 'getTasks').mockImplementation(async (params: any) =>
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
  });
});
