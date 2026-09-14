import { RegisterBuilderService } from './register-builder.service';

describe('Selected branch register context', () => {
  const branchId = '11111111-1111-4111-8111-111111111111';
  let branch: any,
    facts: any,
    query: jest.Mock,
    access: any,
    findOneBy: jest.Mock,
    builder: RegisterBuilderService;
  beforeEach(() => {
    branch = {
      id: branchId,
      clientId: 'client-one',
      branchName: 'Hyderabad',
      stateCode: 'TS',
    };
    facts = { stateCode: 'TS', government: 'STATE' };
    query = jest.fn(async () => (facts ? [facts] : []));
    findOneBy = jest.fn(async () => branch);
    access = {
      assertBranchAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
      assertClientAllowed: jest.fn(),
    };
    builder = new RegisterBuilderService(
      { query, getRepository: () => ({ findOneBy }) } as any,
      access,
    );
  });
  it('derives state from an active authorised branch, not a requested state', async () => {
    const result = await builder.branchContext(branchId, {} as any);
    expect(result).toEqual({
      branchId,
      branchName: 'Hyderabad',
      stateCode: 'TS',
      centralRulesAvailable: false,
    });
    expect(findOneBy).toHaveBeenCalledWith({
      id: branchId,
      isActive: true,
      isDeleted: false,
    });
    expect(access.assertBranchAllowed).toHaveBeenCalled();
    expect(access.assertCcoBranchAllowed).toHaveBeenCalled();
    expect(access.assertClientAllowed).toHaveBeenCalledWith({}, 'client-one');
  });
  it.each(['', 'UNKNOWN', 'CENTRAL'])(
    'rejects a missing or invalid branch state %s',
    async (state) => {
      branch.stateCode = state;
      await expect(builder.branchContext(branchId, {} as any)).rejects.toThrow(
        /state code/,
      );
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('does not expose another branch or a client outside the CCO scope', async () => {
    access.assertCcoBranchAllowed.mockRejectedValue(
      new Error('Outside managed clients'),
    );
    await expect(builder.branchContext(branchId, {} as any)).rejects.toThrow(
      /Outside managed clients/,
    );
    expect(findOneBy).not.toHaveBeenCalled();
  });
  it('rejects mismatched branch facts instead of offering another state', async () => {
    facts.stateCode = 'KA';
    await expect(builder.branchContext(branchId, {} as any)).rejects.toThrow(
      /facts disagree/,
    );
  });
  it('exposes Central eligibility only from explicit matching branch facts', async () => {
    facts = null;
    expect(
      (await builder.branchContext(branchId, {} as any)).centralRulesAvailable,
    ).toBe(false);
    facts = { stateCode: 'TS', government: 'CENTRAL' };
    expect(
      (await builder.branchContext(branchId, {} as any)).centralRulesAvailable,
    ).toBe(true);
  });
});
