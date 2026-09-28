import { DataSource } from 'typeorm';
import { CompliancePctService } from '../common/services/compliance-pct.service';
import { PdfReportService } from './pdf-report.service';
import * as helpers from '../common/utils/pdf-helpers';

describe('Branch-scoped PDF data', () => {
  it.each(['2026-09', undefined])(
    'binds company and branch filters (%s)',
    async (month) => {
      const query = jest.fn().mockResolvedValue([]);
      await new CompliancePctService({
        query,
      } as unknown as DataSource).clientBranchesPct('company', month, [
        'branch-a',
      ]);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`b.id = ANY($${month ? 3 : 2}::uuid[])`),
        month ? ['company', month, ['branch-a']] : ['company', ['branch-a']],
      );
      expect(query.mock.calls[0][0]).toContain('WHERE b.clientid = $1');
      expect(query.mock.calls[0][0]).toContain('ct.client_id = $1');
    },
  );

  it('does not query when the branch list is empty', async () => {
    const query = jest.fn();
    await expect(
      new CompliancePctService({
        query,
      } as unknown as DataSource).clientBranchesPct('company', undefined, []),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves company-wide queries without a branch restriction', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new CompliancePctService({
      query,
    } as unknown as DataSource).clientBranchesPct('company');
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining('ANY('), [
      'company',
    ]);
  });

  const row = (
    branchName: string,
    total: number,
    approved: number,
    submitted: number,
  ) => ({
    branchId: branchName,
    branchName,
    stateCode: 'TS',
    total,
    approved,
    submitted,
    pending: total - approved - submitted,
    overdue: 0,
    compliancePct: total ? (100 * (approved + submitted)) / total : 0,
    riskLevel: 'LOW',
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders a real PDF with weighted scoped KPIs without reading company totals', async () => {
    const kpis = jest.spyOn(helpers, 'kpiRow');
    const heading = jest.spyOn(helpers, 'header');
    const pct = {
      clientBranchesPct: jest
        .fn()
        .mockResolvedValue([
          row('Allowed A', 2, 1, 1),
          row('Allowed B', 8, 0, 0),
        ]),
      clientOverallPct: jest.fn(),
    };
    const pdf = await new PdfReportService(
      pct as unknown as CompliancePctService,
    ).complianceSummary('company', '2026-09', 'Sample company', ['a', 'b']);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pct.clientBranchesPct).toHaveBeenCalledWith('company', '2026-09', [
      'a',
      'b',
    ]);
    expect(pct.clientOverallPct).not.toHaveBeenCalled();
    expect(kpis).toHaveBeenCalledWith(expect.anything(), [
      { label: 'Overall Compliance', value: '20%' },
      { label: 'Total Tasks', value: 10 },
      { label: 'Compliant', value: 2 },
      { label: 'Pending', value: 8 },
      { label: 'Overdue', value: 0 },
    ]);
    expect(heading).toHaveBeenCalledWith(
      expect.anything(),
      'Compliance Summary Report',
      expect.stringContaining('Assigned branches'),
    );
  });

  it('renders zero totals for an empty scoped report without division by zero', async () => {
    const kpis = jest.spyOn(helpers, 'kpiRow');
    const pct = {
      clientBranchesPct: jest.fn().mockResolvedValue([]),
      clientOverallPct: jest.fn(),
    };
    await new PdfReportService(
      pct as unknown as CompliancePctService,
    ).complianceSummary('company', undefined, undefined, []);
    expect(kpis.mock.calls[0][1][0].value).toBe('0%');
    expect(pct.clientOverallPct).not.toHaveBeenCalled();
  });

  it('keeps company totals for an unrestricted report', async () => {
    const pct = {
      clientBranchesPct: jest.fn().mockResolvedValue([]),
      clientOverallPct: jest.fn().mockResolvedValue({
        total: 0,
        compliant: 0,
        pending: 0,
        overdue: 0,
        compliancePct: 0,
      }),
    };
    await new PdfReportService(
      pct as unknown as CompliancePctService,
    ).complianceSummary('company');
    expect(pct.clientOverallPct).toHaveBeenCalledWith('company', undefined);
  });

  it('scopes the risk heatmap and its branch count', async () => {
    const kpis = jest.spyOn(helpers, 'kpiRow');
    const pct = {
      clientBranchesPct: jest.fn().mockResolvedValue([row('Allowed', 2, 2, 0)]),
    };
    const pdf = await new PdfReportService(
      pct as unknown as CompliancePctService,
    ).riskHeatmap('company', undefined, undefined, ['a']);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pct.clientBranchesPct).toHaveBeenCalledWith('company', undefined, [
      'a',
    ]);
    expect(kpis.mock.calls[0][1]).toContainEqual({
      label: 'Total Branches',
      value: 1,
    });
  });
});
