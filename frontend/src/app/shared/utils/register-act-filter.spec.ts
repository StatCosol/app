import { describe, expect, it } from 'vitest';
import { matchesRegisterAct } from './register-act-filter';

describe('register Act filtering', () => {
  it.each([
    ['WAGES_2019', 'CODE_ON_WAGES'],
    ['OSH_2020', 'OSH_CODE'],
    ['SOCIAL_SECURITY_2020', 'SOCIAL_SECURITY'],
    ['TS_SHOPS_1988', 'SHOPS_ESTABLISHMENTS'],
    ['SHOPS_2017', 'SHOPS_ESTABLISHMENTS'],
    ['FACTORIES_1948', 'FACTORIES_ACT'],
    ['CLRA_1970', 'CLRA'],
  ])('includes hashed %s records only in %s', (actCode, group) => {
    const row = { registerType: 'LEGAL_a1b2c3', legalIdentity: { actCode } };
    expect(matchesRegisterAct(row, group, new Set())).toBe(true);
    expect(matchesRegisterAct(row, 'UNRELATED_ACT', new Set())).toBe(false);
    expect(matchesRegisterAct(row, '', new Set())).toBe(true);
  });
  it('retains legacy records without legal metadata', () => {
    expect(
      matchesRegisterAct(
        { registerType: 'PF_REGISTER' },
        'SOCIAL_SECURITY',
        new Set(['PF_REGISTER']),
      ),
    ).toBe(true);
    expect(
      matchesRegisterAct({ registerType: 'OTHER' }, 'SOCIAL_SECURITY', new Set(['PF_REGISTER'])),
    ).toBe(false);
  });
  it('does not override an exact legal identity using an ambiguous legacy label', () => {
    expect(
      matchesRegisterAct(
        { registerType: 'WAGE_REGISTER', legalIdentity: { actCode: 'TS_SHOPS_1988' } },
        'CODE_ON_WAGES',
        new Set(['WAGE_REGISTER']),
      ),
    ).toBe(false);
    expect(
      matchesRegisterAct(
        { registerType: 'LEGAL_unknown', legalIdentity: { actCode: 'MULTI_ACT' } },
        'SHOPS_ESTABLISHMENTS',
        new Set(),
      ),
    ).toBe(false);
  });
});
