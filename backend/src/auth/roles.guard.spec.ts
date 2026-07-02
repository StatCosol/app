import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

function mockContext(user?: unknown): ExecutionContext {
  return {
    getHandler: jest.fn(() => 'handler'),
    getClass: jest.fn(() => 'class'),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => ({ user })),
    })),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows public handlers even when controller roles exist', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        if (key === ROLES_KEY) return ['CLIENT', 'ADMIN'];
        return undefined;
      }),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('rejects protected role routes without a roleCode', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return ['CLIENT', 'ADMIN'];
        return undefined;
      }),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });
});
