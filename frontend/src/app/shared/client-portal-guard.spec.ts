import '@angular/compiler';
import { runInInjectionContext, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../core/auth.service';
import { clientPortalGuard } from '../core/client-portal.guard';

describe('Client portal account boundary', () => {
  function check(loggedIn: boolean, role: string, branch: boolean) {
    const parseUrl = vi.fn((url: string) => url);
    const injector = Injector.create({ providers: [
      { provide: AuthService, useValue: {
        isLoggedIn: () => loggedIn,
        getRoleCode: () => role,
        isBranchUser: () => branch,
      } },
      { provide: Router, useValue: { parseUrl } },
    ] });
    return runInInjectionContext(injector, () => clientPortalGuard({} as any, {} as any));
  }

  it('sends a branch account opening a saved client URL to BranchDesk', () => {
    expect(check(true, 'CLIENT', true)).toBe('/branch');
  });
  it('keeps a client master in the client portal', () => {
    expect(check(true, 'CLIENT', false)).toBe(true);
  });
  it('requires login before opening the client portal', () => {
    expect(check(false, 'CLIENT', false)).toBe('/login');
  });
});

describe('Stored account type precedence', () => {
  it.each([
    [{roleCode: 'CLIENT', userType: 'BRANCH', branchIds: []}, true],
    [{roleCode: 'CLIENT', userType: 'MASTER', branchIds: ['legacy-mapping']}, false],
    [{roleCode: 'CLIENT', userType: null, branchIds: ['branch']}, true],
    [{roleCode: 'CLIENT', userType: null, branchIds: []}, false],
  ])('resolves the stored branch/master identity %#', (user, expected) => {
    expect(AuthService.prototype.isBranchUser.call({getUser: () => user} as any)).toBe(expected);
  });
});
