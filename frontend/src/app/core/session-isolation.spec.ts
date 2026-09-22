// @vitest-environment jsdom
import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { AuthService } from './auth.service';
import { ClientContextService } from './client-context.service';
import { CrmService } from './crm.service';

describe('client data across login sessions', () => {
  let auth: AuthService;
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    auth = new AuthService(
      {
        post: () =>
          of({
            accessToken: 'token-B',
            refreshToken: 'refresh-B',
            user: { id: 'user-B', roleCode: 'CRM' },
          }),
      } as any,
      { navigate: () => Promise.resolve(true) } as any,
      { clearKey: vi.fn() } as any,
    );
    sessionStorage.setItem('user', JSON.stringify({ id: 'user-A', roleCode: 'CRM' }));
  });
  it('clears cached names on logout and refetches for the next login without reloading the SPA', () => {
    const http = {
      get: vi.fn().mockReturnValue(of([{ id: 'client-A', clientName: 'Private A' }])),
    };
    const context = new ClientContextService(http as any, auth);
    context.resolve('client-A').subscribe((value) => expect(value?.clientName).toBe('Private A'));
    auth.logoutOnce();
    auth.login('b@example.invalid', 'fixture').subscribe();
    http.get.mockReturnValue(of([]));
    context.resolve('client-A').subscribe((value) => expect(value).toBeNull());
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('discards an outstanding response from the previous session', () => {
    const slow = new Subject<any[]>();
    const http = { get: vi.fn().mockReturnValueOnce(slow).mockReturnValue(of([])) };
    const context = new ClientContextService(http as any, auth);
    const received = vi.fn();
    context.resolve('client-A').subscribe(received);
    auth.login('b@example.invalid', 'fixture').subscribe();
    slow.next([{ id: 'client-A', clientName: 'Private A' }]);
    slow.complete();
    expect(received).not.toHaveBeenCalled();
    context.resolve('client-A').subscribe((value) => expect(value).toBeNull());
  });
  it('rechecks CRM assignments and cancels an old assignment response on logout', () => {
    const slow = new Subject<any[]>();
    const http = {
      get: vi
        .fn()
        .mockReturnValueOnce(of([{ id: 'client-A' }]))
        .mockReturnValueOnce(of([]))
        .mockReturnValueOnce(slow),
    };
    const crm = new CrmService(http as any, auth);
    crm.getAssignedClientsCached().subscribe((value) => expect(value).toHaveLength(1));
    crm.getAssignedClientsCached().subscribe((value) => expect(value).toHaveLength(0));
    const received = vi.fn();
    crm.getAssignedClientsCached().subscribe(received);
    auth.logoutOnce();
    slow.next([{ id: 'client-A' }]);
    expect(received).not.toHaveBeenCalled();
  });
});
