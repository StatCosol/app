import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('roleGuard', () => {
  let mockAuth: Partial<AuthService>;
  let router: Router;

  beforeEach(() => {
    mockAuth = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      getRoleCode: vi.fn().mockReturnValue('ADMIN'),
      getRoleRedirectPath: vi.fn().mockReturnValue('/admin'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        provideRouter([]),
      ],
    });
    router = TestBed.inject(Router);
  });

  const runGuard = (roles: string[], url = '/admin'): boolean | UrlTree => {
    return TestBed.runInInjectionContext(() => {
      const fn = roleGuard(roles);
      return fn({} as any, { url } as any);
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
    const result = runGuard(['ADMIN']) as UrlTree;
    expect(result.root.children['primary'].segments.map(s => s.path)).toEqual(['login']);
    expect(result.queryParams).toEqual({ returnUrl: '/admin' });
  });

  it('preserves the requested period and fragment without granting access', () => {
    (mockAuth.isLoggedIn as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const destination = '/client/payroll?month=2026-08#inputs';
    const result = runGuard(['CLIENT'], destination) as UrlTree;
    expect(router.parseUrl(router.serializeUrl(result)).queryParams['returnUrl']).toBe(destination);
    expect(result.root.children['primary'].segments.map(s => s.path)).toEqual(['login']);
  });

  it('redirects to /ess/login when ESS role and not logged in', () => {
    (mockAuth.isLoggedIn as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(router.serializeUrl(runGuard(['EMPLOYEE']) as UrlTree)).toBe('/ess/login');
  });

  it('redirects to role dashboard when role does not match', () => {
    (mockAuth.getRoleCode as ReturnType<typeof vi.fn>).mockReturnValue('CRM');
    (mockAuth.getRoleRedirectPath as ReturnType<typeof vi.fn>).mockReturnValue('/crm');
    expect(router.serializeUrl(runGuard(['ADMIN']) as UrlTree)).toBe('/crm');
  });

  it('redirects to /login for unknown role with no redirect path', () => {
    (mockAuth.getRoleCode as ReturnType<typeof vi.fn>).mockReturnValue('UNKNOWN');
    (mockAuth.getRoleRedirectPath as ReturnType<typeof vi.fn>).mockReturnValue('');
    const result = runGuard(['ADMIN']) as UrlTree;
    expect(result.root.children['primary'].segments.map(s => s.path)).toEqual(['login']);
    expect(result.queryParams).toEqual({ returnUrl: '/admin' });
  });
});
