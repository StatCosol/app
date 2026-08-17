import { describe, it, expect } from 'vitest';
import { requireRemarks } from './remarks.util';

describe('requireRemarks', () => {
  it('returns the trimmed remarks when long enough', () => {
    expect(requireRemarks('  approved after review  ')).toBe(
      'approved after review',
    );
  });

  it('throws when shorter than the default minimum (5)', () => {
    expect(() => requireRemarks('hi')).toThrow(/min 5/);
  });

  it('throws for null / empty', () => {
    expect(() => requireRemarks(null)).toThrow();
    expect(() => requireRemarks('   ')).toThrow();
  });

  it('honours a custom minimum length', () => {
    expect(requireRemarks('ok', 2)).toBe('ok');
    expect(() => requireRemarks('ok', 3)).toThrow(/min 3/);
  });
});
