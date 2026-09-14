import { AiRiskEngineService } from './ai-risk-engine.service';

const data = {
  clientName: 'Sample company',
  clientId: 'sample',
  branchCount: 2,
  employeeCount: 10,
  state: 'TS',
  totalMcdItems: 10,
  uploadedMcdItems: 10,
  mcdCompliancePercent: 100,
  pfPendingEmployees: 0,
  esiPendingEmployees: 0,
  pfDelayMonths: 0,
  totalAudits: 1,
  nonComplianceCount: 0,
  openObservations: 0,
  totalContractors: 2,
  contractorsWithExpiredDocs: 0,
  contractorDocCompletionPercent: 100,
  overdueTasks: 0,
  totalTasks: 10,
  overduePercent: 0,
  pendingReturns: 0,
};
function fixture(content?: string) {
  const repo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'assessment', ...x })),
  };
  const insights = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
  const ai = {
    isReady: jest.fn(async () => content !== undefined),
    complete: jest.fn(async () => ({
      content,
      model: 'synthetic',
      promptTokens: 2,
      completionTokens: 3,
    })),
  };
  const service = new AiRiskEngineService(
    repo as any,
    insights as any,
    {} as any,
    ai as any,
    {} as any,
  );
  jest.spyOn(service, 'gatherComplianceData').mockResolvedValue({ ...data });
  return { service, repo, ai, insights };
}
describe('Risk assessment business outcomes with synthetic provider responses', () => {
  it('provides a saved deterministic low-risk assessment without an AI provider', async () => {
    const f = fixture();
    const result = await f.service.runAssessment('sample', 'reviewer');
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('LOW');
    expect(result.clientId).toBe('sample');
    expect(result.summary).toContain('Sample company');
    expect(f.ai.complete).not.toHaveBeenCalled();
  });
  it('ranks a fully unresolved sample above a compliant one and produces actions', async () => {
    const f = fixture();
    jest.spyOn(f.service, 'gatherComplianceData').mockResolvedValue({
      ...data,
      mcdCompliancePercent: 0,
      uploadedMcdItems: 0,
      pfDelayMonths: 4,
      esiPendingEmployees: 10,
      nonComplianceCount: 5,
      overduePercent: 100,
      overdueTasks: 10,
      pendingReturns: 5,
    });
    const result = await f.service.runAssessment('sample', 'reviewer');
    expect(result.riskScore).toBe(100);
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.recommendations?.length).toBeGreaterThan(0);
    expect(f.insights.save).toHaveBeenCalled();
  });
  it.each([-1, 101, 45.5, 'not-a-score', {}, []])(
    'rejects invalid provider score %j and saves the deterministic fallback',
    async (riskScore) => {
      const f = fixture(
        JSON.stringify({ riskScore, summary: 'Untrusted score' }),
      );
      const result = await f.service.runAssessment('sample', 'reviewer');
      expect(result.riskScore).toBe(0);
      expect(result.summary).toContain('Sample company');
      expect(result.aiModel).toBeNull();
    },
  );
  it.each([
    'not-json',
    'null',
    JSON.stringify({ riskScore: 40, summary: { text: 'bad' } }),
    JSON.stringify({
      riskScore: 40,
      summary: 'bad recommendations',
      recommendations: 'not-an-array',
    }),
  ])('falls back for malformed response %s', async (content) => {
    const result = await fixture(content).service.runAssessment(
      'sample',
      'reviewer',
    );
    expect(result.riskScore).toBe(0);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(typeof result.summary).toBe('string');
  });
  it('persists valid provider data with attribution', async () => {
    const result = await fixture(
      JSON.stringify({
        riskScore: 40,
        summary: 'Review missing evidence',
        recommendations: [
          { priority: 1, action: 'Review evidence', impact: 'Resolve gap' },
        ],
        predictions: { trendDirection: 'STABLE' },
      }),
    ).service.runAssessment('sample', 'reviewer');
    expect(result.riskScore).toBe(40);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.aiModel).toBe('synthetic');
    expect(result.assessedBy).toBe('reviewer');
  });
});
