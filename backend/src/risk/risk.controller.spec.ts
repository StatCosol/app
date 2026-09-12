import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

describe('Risk record boundaries', () => {
  const user = { roleCode: 'BRANCH_DESK', clientId: 'c' } as any;
  it('preserves the empty branch set and checks trend scope before loading data', async () => {
    const risk = { getHeatmap: jest.fn(), getTrend: jest.fn() };
    const scope = {
      resolve: jest
        .fn()
        .mockResolvedValue({ level: 'branches', branchIds: [] }),
    };
    const controller = new RiskController(risk as any, scope as any, {} as any);
    await controller.heatmap('2026-09', undefined as any, user);
    expect(risk.getHeatmap).toHaveBeenCalledWith({
      clientId: 'c',
      branchIds: [],
      month: '2026-09',
    });
    scope.resolve.mockRejectedValue(new Error('Forbidden'));
    await expect(
      controller.trend('foreign', '2026-09-01', '2026-09-30', user),
    ).rejects.toThrow('Forbidden');
    expect(risk.getTrend).not.toHaveBeenCalled();
  });
  it('empty scope remains an SQL restriction', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new RiskService({ query } as any);
    await service.getHeatmap({
      clientId: 'c',
      branchIds: [],
      month: '2026-09',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('id = ANY($2::uuid[])'),
      ['c', []],
    );
  });
  it('rejects malformed periods before database access', async () => {
    const controller = new RiskController({} as any, {} as any, {} as any);
    await expect(controller.heatmap('2026-13', 'c', user)).rejects.toThrow(
      'month',
    );
    await expect(
      controller.trend('b', '2026-02-30', '2026-09-30', user),
    ).rejects.toThrow('date range');
  });
});
