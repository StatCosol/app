import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';

describe('roleGuard', () => {
  const authServiceMock = {
    isLoggedIn: vi.fn(),
    getCurrentRole: vi.fn(),
  };
  const routerMock = {
    createUrlTree: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  function runGuard(roles: string[]): any {
    const route = { data: { roles } } as unknown as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => roleGuard(route, state));
  }

  it('should allow access when user has correct role', () => {
    authServiceMock.isLoggedIn.mockReturnValue(true);
    authServiceMock.getCurrentRole.mockReturnValue('admin');

    expect(runGuard(['admin', 'ceo'])).toBe(true);
  });

  it('should redirect to /login when not logged in', () => {
    authServiceMock.isLoggedIn.mockReturnValue(false);
    routerMock.createUrlTree.mockReturnValue({} as any);

    runGuard(['admin']);

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('should redirect to /unauthorized when role mismatch', () => {
    authServiceMock.isLoggedIn.mockReturnValue(true);
    authServiceMock.getCurrentRole.mockReturnValue('branch');
    routerMock.createUrlTree.mockReturnValue({} as any);

    runGuard(['admin', 'ceo']);

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });
});
