import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { moduleAccessGuard } from './module-access.guard';
import { AuthService } from './auth.service';

describe('moduleAccessGuard', () => {
  let mockAuth: Partial<AuthService>;
  let mockRouter: Partial<Router>;

  beforeEach(() => {
    mockAuth = {
      hasModule: vi.fn(),
      hasAnyModule: vi.fn(),
      getClientModuleHomePath: vi.fn().mockReturnValue('/client/home'),
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

  const run = (code: string | string[]) =>
    TestBed.runInInjectionContext(() =>
      moduleAccessGuard(code)({} as never, {} as never),
    );

  it('allows access when the single module is granted', () => {
    (mockAuth.hasModule as ReturnType<typeof vi.fn>).mockReturnValue(true);
    expect(run('PAYROLL')).toBe(true);
    expect(mockAuth.hasModule).toHaveBeenCalledWith('PAYROLL');
  });

  it('allows access when any of several modules is granted', () => {
    (mockAuth.hasAnyModule as ReturnType<typeof vi.fn>).mockReturnValue(true);
    expect(run(['PAYROLL', 'CRM'])).toBe(true);
    expect(mockAuth.hasAnyModule).toHaveBeenCalledWith(['PAYROLL', 'CRM']);
  });

  it('redirects to the client home path when access is denied', () => {
    (mockAuth.hasModule as ReturnType<typeof vi.fn>).mockReturnValue(false);
    run('PAYROLL');
    expect(mockRouter.parseUrl).toHaveBeenCalledWith('/client/home');
  });
});
