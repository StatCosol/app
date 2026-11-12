import { ComplianceMetricsService } from './compliance-metrics.service';
describe('dashboard risk snapshot', () => {
  it('counts risk levels consistently, without double counting critical branches', async () => {
    const svc = Object.create(ComplianceMetricsService.prototype);
    svc.getRiskScore = jest.fn().mockResolvedValue({
      items: [
        {
          branchName: 'A',
          inspectionProbability: 85,
          riskLevel: 'HIGH',
          completionPercent: 0,
        },
        {
          branchName: 'B',
          inspectionProbability: 95,
          riskLevel: 'CRITICAL',
          completionPercent: 0,
        },
      ],
    });
    const result = await svc.getSummary({ month: '2026-11' });
    expect(result.highRiskBranches).toBe(1);
    expect(result.criticalBranches).toBe(1);
  });
  const rows = [
    {
      branchId: 'one',
      branchName: 'One',
      inspectionProbability: 80,
      completionPercent: 0,
      riskLevel: 'HIGH',
      reasons: [],
      overdueSla: 0,
    },
    {
      branchId: 'two',
      branchName: 'Two',
      inspectionProbability: 20,
      completionPercent: 100,
      riskLevel: 'LOW',
      reasons: [],
      overdueSla: 0,
    },
  ];
  it('returns the exact rows used for the company aggregates', async () => {
    const svc = Object.create(ComplianceMetricsService.prototype);
    svc.getRiskScore = jest.fn().mockResolvedValue({ items: rows });
    const result = await svc.getSummary({
      clientId: 'client',
      month: '2026-11',
      user: {},
    });
    expect(result.items).toBe(rows);
    expect(result.avgInspectionProbability).toBe(50);
    expect(result.avgCompletionPercent).toBe(50);
  });
  it('keeps selected-branch details scoped and exposes an empty snapshot honestly', async () => {
    const svc = Object.create(ComplianceMetricsService.prototype);
    svc.getRiskScore = jest.fn().mockResolvedValue({ items: [] });
    expect(
      (await svc.getSummary({ clientId: 'client', month: '2026-11', user: {} }))
        .items,
    ).toEqual([]);
    expect(
      (
        await svc.getSummary({
          clientId: 'client',
          month: '2026-11',
          branchId: 'one',
          user: {},
        })
      ).details,
    ).toBeNull();
  });
});
