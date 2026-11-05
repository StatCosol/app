import 'reflect-metadata';
import { PayrollSetupService } from './payroll-setup.service';
import { UpsertPayrollSetupDto } from './dto/payroll-setup.dto';
import { createGlobalValidationPipe } from '../common/validators/global-validation-pipe';

describe('payroll wage-basis persistence', () => {
  const clientId = 'client-a';
  const pipe = createGlobalValidationPipe();
  const validate = (body: unknown) =>
    pipe.transform(body, {
      type: 'body',
      metatype: UpsertPayrollSetupDto,
      data: '',
    });

  function fixture(initial: Record<string, unknown> | null) {
    let stored = initial;
    const repo = {
      findOne: jest.fn(async () => (stored ? { ...stored } : null)),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => {
        stored = { ...value };
        return { ...stored };
      }),
    };
    const service = new PayrollSetupService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, repo };
  }

  it('keeps calendar days after saving and reloading an existing fixed-26 setup', async () => {
    const { service } = fixture({
      clientId,
      wageBasisDays: 'FIXED_26',
      pfEnabled: true,
    });
    const body = await validate({ wageBasisDays: 'CALENDAR_DAYS' });
    await service.upsertSetup(clientId, body);
    expect(await service.getSetup(clientId)).toMatchObject({
      clientId,
      wageBasisDays: 'CALENDAR_DAYS',
      pfEnabled: true,
    });
  });

  it('persists the selected basis when creating a setup', async () => {
    const { service } = fixture(null);
    await service.upsertSetup(
      clientId,
      await validate({ wageBasisDays: 'CALENDAR_DAYS' }),
    );
    expect(await service.getSetup(clientId)).toMatchObject({
      clientId,
      wageBasisDays: 'CALENDAR_DAYS',
    });
  });

  it('preserves the selected basis when another setup section is saved', async () => {
    const { service } = fixture({ clientId, wageBasisDays: 'CALENDAR_DAYS' });
    await service.upsertSetup(clientId, await validate({ pfEnabled: false }));
    expect(await service.getSetup(clientId)).toMatchObject({
      wageBasisDays: 'CALENDAR_DAYS',
      pfEnabled: false,
    });
  });

  it('supports an explicit change back to fixed 26 days', async () => {
    const { service } = fixture({ clientId, wageBasisDays: 'CALENDAR_DAYS' });
    await service.upsertSetup(
      clientId,
      await validate({ wageBasisDays: 'FIXED_26' }),
    );
    expect(await service.getSetup(clientId)).toMatchObject({
      wageBasisDays: 'FIXED_26',
    });
  });

  it('rejects an unknown basis before persistence', async () => {
    await expect(validate({ wageBasisDays: '31' })).rejects.toThrow();
  });
});
