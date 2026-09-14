import { registerReuseRule } from './register-reuse-rule';
import { registerLayout } from './register-layouts';
import { RegisterEvidenceService } from './register-evidence.service';
import { REGISTER_FORMS } from './register-catalogue';
import { legalRegisterType } from './register-identity';

const form = (source: string, number: string) =>
  REGISTER_FORMS.find((f) => f.sourceId === source && f.formNumber === number)!;
describe('State-scoped register reuse', () => {
  it('checks both Acts and selects only Bihar wage evidence for the branch and period', async () => {
    const target = form('brosh', 'VIII(B)'),
      source = form('brw', 'IV');
    const context = jest.fn(async (id: string) => ({
      form: id === target.id ? target : source,
      branch: { clientId: 'client' },
      applicabilityEvidence: [{ applicable: true }],
    }));
    const query = jest.fn().mockResolvedValue([]);
    const service = new RegisterEvidenceService(
      { query } as any,
      { context } as any,
    );
    const result = await service.reuseOptions(target.id, 'branch', 2026, 9, {
      roleCode: 'PAYROLL',
    } as any);
    expect(context).toHaveBeenNthCalledWith(2, source.id, 'branch', 2026, 9, {
      roleCode: 'PAYROLL',
    });
    expect(query.mock.calls[0][1]).toEqual([
      'client',
      'branch',
      2026,
      9,
      legalRegisterType(source.id),
      null,
    ]);
    expect(result.basis).toBe('Bihar OSH Rules 2026, Rule 27(2)');
  });
  it('does not reuse a source if its independent applicability check fails', async () => {
    const target = form('brosh', 'VIII(C)');
    const context = jest
      .fn()
      .mockResolvedValueOnce({ form: target })
      .mockRejectedValueOnce(new Error('Wages Act not applicable'));
    const query = jest.fn();
    const service = new RegisterEvidenceService(
      { query } as any,
      { context } as any,
    );
    await expect(
      service.reuseOptions(target.id, 'branch', 2026, 9, {} as any),
    ).rejects.toThrow(/not applicable/);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects unverified Andhra Pradesh equivalence and Bihar event registers', async () => {
    for (const target of [form('aposh', 'IX'), form('brosh', 'X')]) {
      const query = jest.fn();
      const context = jest.fn().mockResolvedValue({ form: target });
      const service = new RegisterEvidenceService(
        { query } as any,
        { context } as any,
      );
      await expect(
        service.reuseOptions(target.id, 'branch', 2026, 9, {} as any),
      ).rejects.toThrow(/No verified/);
      expect(query).not.toHaveBeenCalled();
    }
  });
});

it('keeps every verified reuse pair within the same jurisdiction and data purpose', () => {
  for (const target of REGISTER_FORMS) {
    const rule = registerReuseRule(target);
    if (!rule) continue;
    const source = form(rule.sourceId, rule.sourceNumber);
    expect(source).toBeDefined();
    expect(source.jurisdiction).toBe(target.jurisdiction);
    expect(
      registerLayout(source.sourceId, source.formNumber)?.baseFormNumber,
    ).toBe(registerLayout(target.sourceId, target.formNumber)?.baseFormNumber);
  }
});
