import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  it('should return a CanActivateFn', () => {
    const guardFn = roleGuard(['ADMIN']);
    expect(typeof guardFn).toBe('function');
  });
});
