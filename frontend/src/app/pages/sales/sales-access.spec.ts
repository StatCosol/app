import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { SALES_ROUTES } from './sales.routes';
import { CEO_ROUTES } from '../ceo/ceo.routes';

describe('Sales workspace access', () => {
  for (const [portal, routes, allowed] of [
    ['sales', SALES_ROUTES, 'SALES'],
    ['ceo', CEO_ROUTES, 'CEO'],
  ] as const) {
    for (const role of ['ADMIN', 'SALES', 'CEO']) {
      it(`${portal} permits ${allowed} and handles ${role} correctly`, () => {
        TestBed.configureTestingModule({
          providers: [
            { provide: AuthService, useValue: {
              isLoggedIn: () => true,
              getRoleCode: () => role,
              getRoleRedirectPath: () => '/' + role.toLowerCase(),
            } },
            { provide: Router, useValue: { parseUrl: (url: string) => ({ url }) } },
          ],
        });
        const guard = routes.find(r => r.path === portal)!.canActivate![0] as CanActivateFn;
        const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));
        if (role === allowed) expect(result).toBe(true);
        else expect(result).toEqual({ url: '/' + role.toLowerCase() });
      });
    }
  }
  it('keeps Sales Pipeline and Follow-ups inside the CEO workspace', () => {
    const routes = CEO_ROUTES.find(r => r.path === 'ceo')!.children!;
    expect(routes.some(r => r.path === 'sales' && r.loadComponent)).toBe(true);
    expect(routes.some(r => r.path === 'followups' && r.loadComponent)).toBe(true);
  });
});
