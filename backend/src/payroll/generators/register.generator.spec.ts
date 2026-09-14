import { GoneException } from '@nestjs/common';
import { RegisterGenerator } from './register.generator';

describe('Retired generic statutory register generation', () => {
  it('rejects single, bulk and branch-template paths before reading or writing data', async () => {
    const find = jest.fn();
    const generator = new RegisterGenerator({ find } as any);
    for (const call of [
      () => generator.generate('run', 'TS', 'WAGE_REGISTER', 'user'),
      () => generator.generateAllForBranch('run', 'branch', 'user'),
      () => generator.listTemplatesForBranch('branch'),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(GoneException);
    }
    expect(find).not.toHaveBeenCalled();
  });
  it('retains legacy metadata as reference-only', async () => {
    const generator = new RegisterGenerator({
      find: jest.fn().mockResolvedValue([{ id: 'old', isActive: true }]),
    } as any);
    expect(await generator.listTemplates('TS')).toEqual([
      {
        id: 'old',
        isActive: true,
        generation: 'REFERENCE_ONLY',
        preparationAvailable: false,
      },
    ]);
  });
});
