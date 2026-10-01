import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RegisterBuilderService } from './register-builder.service';
import { RegisterLibraryController } from './register-library.controller';
import { RegisterIneligibleException } from './register-ineligible.exception';

describe('Register eligibility result', () => {
  const form = 'ts--shops-1988--ts-integrated-2019--ii---iii--tsi';
  const branchId = '94ad1c42-ea05-460e-b494-0a7e634de127';
  let builder: RegisterBuilderService, controller: RegisterLibraryController;
  let decision: any, query: jest.Mock, access: any;
  beforeEach(() => {
    decision = {
      applicable: true,
      computedAt: '2026-10-01',
      factsUpdatedAt: '2026-04-04',
      factState: 'TS',
      government: 'STATE',
      establishmentType: 'FACTORY',
    };
    query = jest.fn(async () => [decision]);
    access = {
      assertBranchAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
      assertClientAllowed: jest.fn(),
    };
    builder = new RegisterBuilderService(
      {
        query,
        getRepository: () => ({
          findOneBy: async () => ({
            id: branchId,
            clientId: 'client',
            branchName: 'BRM',
            stateCode: 'TS',
          }),
        }),
      } as any,
      access,
    );
    controller = new RegisterLibraryController({} as any, builder, {} as any);
  });
  const user = {} as any;
  const check = () => controller.eligibility(form, branchId, '2026', '3', user);

  it('returns the applicability reason for the reported BRM March configuration', async () => {
    decision.applicable = false;
    decision.government = null;
    expect(await check()).toEqual({
      eligible: false,
      reason:
        'Confirm TS_SHOPS_1988 applicability in the branch applicability screen before generating registers.',
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      branchId,
      'TS_SHOPS_1988',
    ]);
    // Only the read endpoint translates the result; preparation still rejects it.
    await expect(
      builder.context(form, branchId, 2026, 3, user),
    ).rejects.toBeInstanceOf(RegisterIneligibleException);
    await expect(
      builder.prefill(form, branchId, '', 2026, 3, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['government', null, 'appropriate government'],
    ['factsUpdatedAt', '2026-10-02', 'Recompute'],
    ['factState', 'KA', 'facts disagree'],
  ])(
    'explains blocked %s without treating the eligibility check as a failed request',
    async (key, value, reason) => {
      decision[key] = value;
      expect(await check()).toEqual({
        eligible: false,
        reason: expect.stringContaining(reason),
      });
    },
  );

  it('reports eligible only when the selected Act passes all checks', async () => {
    expect(await check()).toMatchObject({ eligible: true, branchName: 'BRM' });
  });

  it('preserves malformed-request failures', async () => {
    await expect(
      controller.eligibility(form, branchId, '2026', '13', user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves access denials without exposing branch applicability', async () => {
    access.assertBranchAllowed.mockRejectedValue(new ForbiddenException());
    await expect(check()).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not hide unexpected server failures as ineligibility', async () => {
    query.mockRejectedValue(new Error('Database unavailable'));
    await expect(check()).rejects.toThrow('Database unavailable');
  });
});
