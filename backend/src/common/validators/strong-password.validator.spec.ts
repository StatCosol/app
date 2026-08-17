import { IsStrongPasswordConstraint } from './strong-password.validator';

/**
 * Password-strength rule: ≥8 chars with upper, lower, digit, and special.
 * Security-relevant, so each failing condition is checked independently.
 */
describe('IsStrongPasswordConstraint', () => {
  const c = new IsStrongPasswordConstraint();

  it('accepts a password meeting every requirement', () => {
    expect(c.validate('Abcdef1!')).toBe(true);
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no lowercase', 'ABCDEFG1!'],
    ['no digit', 'Abcdefgh!'],
    ['no special char', 'Abcdefg1'],
  ])('rejects: %s', (_label, pwd) => {
    expect(c.validate(pwd)).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(c.validate(12345678 as unknown as string)).toBe(false);
  });
});
