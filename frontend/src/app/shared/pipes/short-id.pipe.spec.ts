import { describe, it, expect } from 'vitest';
import { ShortIdPipe } from './short-id.pipe';

describe('ShortIdPipe', () => {
  const pipe = new ShortIdPipe();

  it('truncates a long UUID to its first 8 chars', () => {
    expect(pipe.transform('1234567890abcdef')).toBe('12345678');
  });

  it('leaves a value of 8 or fewer chars unchanged', () => {
    expect(pipe.transform('short')).toBe('short');
    expect(pipe.transform('12345678')).toBe('12345678');
  });

  it('returns empty string for null/undefined', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
