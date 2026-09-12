import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../auth.service';
import { IdleTimeoutService } from '../idle-timeout.service';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * A mutating request is deliberately NOT replayed after a token refresh —
 * replaying a POST could create the row twice. The cost is that the user's
 * click did nothing, and the error interceptor suppresses toasts for 401
 * outright, so an expired session showed as a Save button that failed in
 * silence while the very next press would have worked.
 */
describe('authInterceptor — session renewal is visible', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let toast: ToastService;

  const auth = {
    getAccessToken: vi.fn(() => 'expired-token'),
    getRefreshToken: vi.fn(() => 'refresh-token'),
    refreshAccessToken: vi.fn(() => of('fresh-token')),
    logoutOnce: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('expired-token');
    auth.getRefreshToken.mockReturnValue('refresh-token');
    auth.refreshAccessToken.mockReturnValue(of('fresh-token'));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        ToastService,
        { provide: AuthService, useValue: auth },
        { provide: IdleTimeoutService, useValue: { checkFromInterceptor: () => true } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpTesting.verify());

  // TestRequest, not a structural stand-in: its flush() overloads are narrower
  // than any hand-written shape, so anything looser fails to accept it.
  const unauthorized = (req: TestRequest) =>
    req.flush({ message: 'Unauthorized', statusCode: 401 }, { status: 401, statusText: 'Unauthorized' });

  it('tells the user their submit was dropped when a POST hits an expired session', async () => {
    const warn = vi.spyOn(toast, 'warning');
    let failed = false;

    http.post('/api/v1/contractor/employees', { name: 'Ravi' }).subscribe({
      error: () => (failed = true),
    });

    unauthorized(httpTesting.expectOne('/api/v1/contractor/employees'));
    await Promise.resolve();

    // Refreshed for the next attempt, but the POST itself is not replayed.
    expect(auth.refreshAccessToken).toHaveBeenCalled();
    expect(failed).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Session renewed',
      expect.stringContaining('try that once more'),
    );
  });

  it.each([0, 408, 429, 503])('keeps the session on temporary renewal failure %s and permits retry', (status) => {
    auth.refreshAccessToken.mockReturnValue(throwError(() => ({ status })));
    http.get('/api/v1/ess/profile').subscribe({ error: () => {} });
    unauthorized(httpTesting.expectOne('/api/v1/ess/profile'));
    expect(auth.logoutOnce).not.toHaveBeenCalled();

    auth.refreshAccessToken.mockReturnValue(of('fresh-token'));
    let result: unknown;
    http.get('/api/v1/ess/profile').subscribe(value => result = value);
    unauthorized(httpTesting.expectOne('/api/v1/ess/profile'));
    const retry = httpTesting.expectOne('/api/v1/ess/profile');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it.each([400, 401, 403])('still ends rejected sessions on renewal status %s', (status) => {
    auth.refreshAccessToken.mockReturnValue(throwError(() => ({ status })));
    http.get('/api/v1/ess/profile').subscribe({ error: () => {} });
    unauthorized(httpTesting.expectOne('/api/v1/ess/profile'));
    expect(auth.logoutOnce).toHaveBeenCalled();
  });

  it('does not nag when the refresh itself is what failed', async () => {
    // logoutOnce takes the user to the login screen; a toast on top of that is
    // noise, and "try again" would be a lie.
    const warn = vi.spyOn(toast, 'warning');
    auth.getRefreshToken.mockReturnValue(null as unknown as string);

    http.post('/api/v1/contractor/employees', { name: 'Ravi' }).subscribe({ error: () => {} });

    unauthorized(httpTesting.expectOne('/api/v1/contractor/employees'));
    await Promise.resolve();

    expect(auth.logoutOnce).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
