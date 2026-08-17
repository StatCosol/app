import { describe, it, expect } from 'vitest';
import type { AbstractControl } from '@angular/forms';
import {
  passwordStrength,
  emailValidator,
  phoneValidator,
  panValidator,
  aadhaarValidator,
  minLengthMsg,
  requiredMsg,
  matchValidator,
} from './validators';

/** Minimal fake control — the validators only read `.value` (and `.root` for match). */
const ctrl = (value: unknown) => ({ value }) as unknown as AbstractControl;

describe('passwordStrength', () => {
  const v = passwordStrength();
  it('accepts a strong password', () => expect(v(ctrl('Abcdef1!'))).toBeNull());
  it('is null for empty (required handles emptiness)', () =>
    expect(v(ctrl(''))).toBeNull());
  it.each(['Ab1!', 'abcdefg1!', 'ABCDEFG1!', 'Abcdefgh!', 'Abcdefg1'])(
    'flags a weak password: %s',
    (pwd) => expect(v(ctrl(pwd))).not.toBeNull(),
  );
});

describe('emailValidator', () => {
  const v = emailValidator();
  it('accepts a valid email', () => expect(v(ctrl('a@b.co'))).toBeNull());
  it('rejects an invalid email', () =>
    expect(v(ctrl('not-an-email'))).toEqual({
      email: 'Please enter a valid email address',
    }));
});

describe('phoneValidator', () => {
  const v = phoneValidator();
  it('accepts country-code + 10 digits', () =>
    expect(v(ctrl('+919876543210'))).toBeNull());
  it('rejects a bare 10-digit number', () =>
    expect(v(ctrl('9876543210'))).not.toBeNull());
});

describe('panValidator', () => {
  const v = panValidator();
  it('accepts a valid PAN', () => expect(v(ctrl('ABCDE1234F'))).toBeNull());
  it('rejects lowercase / wrong shape', () => {
    expect(v(ctrl('abcde1234f'))).not.toBeNull();
    expect(v(ctrl('ABCD1234F'))).not.toBeNull();
  });
});

describe('aadhaarValidator', () => {
  const v = aadhaarValidator();
  it('accepts 12 digits (spaces stripped)', () =>
    expect(v(ctrl('1234 5678 9012'))).toBeNull());
  it('rejects the wrong number of digits', () =>
    expect(v(ctrl('12345'))).not.toBeNull());
});

describe('minLengthMsg', () => {
  const v = minLengthMsg(5, 'Name');
  it('passes at or above the minimum', () =>
    expect(v(ctrl('abcde'))).toBeNull());
  it('fails below the minimum', () => expect(v(ctrl('abc'))).not.toBeNull());
  it('is null when empty', () => expect(v(ctrl(''))).toBeNull());
});

describe('requiredMsg', () => {
  const v = requiredMsg('Email');
  it.each(['', '   ', null, undefined])('flags empty value: %s', (val) =>
    expect(v(ctrl(val))).toEqual({ required: 'Email is required' }),
  );
  it('passes a real value', () => expect(v(ctrl('x'))).toBeNull());
});

describe('matchValidator', () => {
  const v = matchValidator('password');
  const withRoot = (value: string, other: string | null) =>
    ({
      value,
      root: { get: (n: string) => (n === 'password' && other !== null ? { value: other } : null) },
    }) as unknown as AbstractControl;

  it('passes when the values match', () =>
    expect(v(withRoot('secret', 'secret'))).toBeNull());
  it('errors on a mismatch', () =>
    expect(v(withRoot('secret', 'nope'))).toEqual({
      mismatch: 'Passwords do not match',
    }));
  it('is null when the matched control is absent', () =>
    expect(v(withRoot('secret', null))).toBeNull());
});
