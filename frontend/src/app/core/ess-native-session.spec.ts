import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { AuthService } from './auth.service';

describe('ESS native session handoff', () => {
  const postMessage = vi.fn();
  const http = { post: vi.fn() };
  let auth: AuthService;
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks();
    Object.defineProperty(window, 'StatcoSession', { configurable: true, value: { postMessage } });
    auth = new AuthService(http as any, { navigate: vi.fn().mockResolvedValue(true) } as any,
      { setKey: (value: string) => sessionStorage.setItem('encryptionKey', value), clearKey: vi.fn() } as any);
  });
  afterEach(() => { delete (window as any).StatcoSession; sessionStorage.clear(); localStorage.clear(); });
  const response = { accessToken: 'access', refreshToken: 'refresh', user: { id: 'employee', roleCode: 'EMPLOYEE' }, encryptionKey: 'key' };
  it('saves employee session tokens after login without persisting the password in either storage', async () => {
    http.post.mockReturnValue(of(response));
    await firstValueFrom(auth.essLogin('SAMPLE', 'sample@example.invalid', 'private-password'));
    const payload = JSON.parse(postMessage.mock.calls[0][0]);
    expect(payload).toEqual({ action: 'save', session: {
      accessToken: 'access', refreshToken: 'refresh', user: JSON.stringify(response.user), encryptionKey: 'key',
    }});
    expect(postMessage.mock.calls[0][0]).not.toContain('private-password');
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
  it('updates rotating tokens and clears the native session on logout', async () => {
    http.post.mockReturnValue(of(response));
    await firstValueFrom(auth.essLogin('SAMPLE', 'sample@example.invalid', 'password'));
    http.post.mockReturnValue(of({ ...response, accessToken: 'new-access', refreshToken: 'new-refresh' }));
    await firstValueFrom(auth.refreshAccessToken());
    expect(JSON.parse(postMessage.mock.lastCall![0]).session.refreshToken).toBe('new-refresh');
    auth.logoutOnce('test', true);
    expect(JSON.parse(postMessage.mock.lastCall![0])).toEqual({ action: 'clear' });
    expect(auth.getRefreshToken()).toBe('');
  });
  it('never persists non-employee sessions', async () => {
    http.post.mockReturnValue(of({ ...response, user: { roleCode: 'ADMIN' } }));
    await firstValueFrom(auth.essLogin('SAMPLE', 'sample@example.invalid', 'password'));
    expect(JSON.parse(postMessage.mock.lastCall![0])).toEqual({ action: 'clear' });
  });
  it('continues login if native storage is unavailable', async () => {
    postMessage.mockImplementationOnce(() => { throw new Error('unavailable'); });
    http.post.mockReturnValue(of(response));
    await firstValueFrom(auth.essLogin('SAMPLE', 'sample@example.invalid', 'password'));
    expect(auth.getAccessToken()).toBe('access');
  });
});
