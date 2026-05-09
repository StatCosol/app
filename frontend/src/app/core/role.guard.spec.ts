import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('roleGuard', () => {
  let mockAuth: Partial<AuthService>;
  let mockRouter: Partial<Router>;

  beforeEach(() => {
    mockAuth = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      getRoleCode: vi.fn().mockReturnValue('ADMIN'),
      getRoleRedirectPath: vi.fn().mockReturnValue('/admin'),
    };
    mockRouter = {
      parseUrl: vi.fn((url: string) => ({ toString: () => url }) as UrlTree),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  const runGuard = (roles: string[]): boolean | UrlTree => {
    return TestBed.runInInjectionContext(() => {
      const fn = roleGuard(roles);
      return fn({} as any, {} as any);
    }) as boolean | UrlTree;
  };

  it('should return a CanActivateFn', () => {
    const guardFn = roleGuard(['ADMIN']);
    expect(typeof guardFn).toBe('function');
  });

  it('allows access when user role matches', () => {
    (mockAuth.getRoleCode as ReturnType<typeof vi.fn>).mockReturnValue('ADMIN');
    expect(runGuard(['ADMIN', 'CEO'])).toBe(true);
  });

  it('redirects to /login when not logged in', () => {
    (mockAuth.isLoggedIn as ReturnType<typeof vi.fn>).mockReturnValue(false);
    runGuard(['ADMIN']);
    expect(mockRouter.parseUrl).toHaveBeenCalledWith('/login');
  });

  it('redirects to /ess/login when ESS role and not logged in', () => {
    (mockAuth.isLoggedIn as ReturnType<typeof vi.fn>).mockReturnValue(false);
    runGuard(['EMPLOYEE']);
    expect(mockRouter.parseUrl).toHaveBeenCalledWith('/ess/login');
  });

  it('redirects to role dashboard when role does not match', () => {
    (mockAuth.getRoleCode as ReturnType<typeof vi.fn>).mockReturnValue('CRM');
    (mockAuth.getRoleRedirectPath as ReturnType<typeof vi.fn>).mockReturnValue('/crm');
    runGuard(['ADMIN']);
    expect(mockRouter.parseUrl).toHaveBeenCalledWith('/crm');
  });

  it('redirects to /login for unknown role with no redirect path', () => {
    (mockAuth.getRoleCode as ReturnType<typeof vi.fn>).mockReturnValue('UNKNOWN');
    (mockAuth.getRoleRedirectPath as ReturnType<typeof vi.fn>).mockReturnValue('');
    runGuard(['ADMIN']);
    expect(mockRouter.parseUrl).toHaveBeenCalledWith('/login');
  });
});
