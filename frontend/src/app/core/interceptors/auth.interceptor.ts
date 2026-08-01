import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  catchError,
  filter,
  shareReplay,
  switchMap,
  take,
  tap,
  throwError,
} from 'rxjs';
import { AuthService } from '../auth.service';
import { IdleTimeoutService } from '../idle-timeout.service';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const authService = inject(AuthService);
  const idleTimeout = inject(IdleTimeoutService);
  const isEssPath = window.location.pathname.includes('/ess/');

  // Safety net: check idle timeout on every API request.
  // If the user is idle beyond the timeout, logout immediately.
  const isAuthEndpointEarly = /\/auth\/(login|ess\/login|session-config|refresh|logout)(\b|\/)/.test(req.url);
  if (!isAuthEndpointEarly && !idleTimeout.checkFromInterceptor()) {
    return EMPTY; // logout in progress, drop the request
  }

  const accessToken = authService.getAccessToken();

  // Only attach the bearer token to same-origin / own-API requests to avoid
  // leaking it to any future third-party host the app might call.
  const isOwnApi = (() => {
    try {
      // Relative URLs (no scheme) are always same-origin
      if (!/^https?:\/\//i.test(req.url)) return true;
      const u = new URL(req.url, window.location.origin);
      return u.origin === window.location.origin;
    } catch {
      return false;
    }
  })();

  let authReq = req;
  if (accessToken && isOwnApi) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthEndpoint = /\/auth\/(login|ess\/login|refresh|logout)(\b|\/)/.test(authReq.url);

      if (error.status !== 401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      // Only auto-retry idempotent verbs. POST/PUT/PATCH/DELETE may have
      // partially succeeded server-side; replaying them after a token refresh
      // could create duplicate invoices, double-charge payments, etc.
      // For mutating requests we refresh the token (so the *next* user action
      // works) but surface the 401 to the caller so they can decide.
      const method = (authReq.method || 'GET').toUpperCase();
      const isIdempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

      const refreshToken = authService.getRefreshToken();
      if (!refreshToken) {
        authService.logoutOnce('no refresh token', isEssPath);
        return throwError(() => error);
      }

      // First 401 triggers the refresh; concurrent 401s wait for the result
      if (!isRefreshing) {
        isRefreshing = true;
        refreshTokenSubject.next(null);

        // Keep the refresh request alive even if the request that triggered it
        // is unsubscribed (for example by a page-level timeout). With
        // refCount:false, a retry can queue on refreshTokenSubject and receive
        // the eventual token instead of leaving isRefreshing stuck forever.
        const refresh$ = authService.refreshAccessToken().pipe(
          // Logout ONLY on refresh failure — not on retry failure
          catchError((refreshError) => {
            refreshTokenSubject.next('REFRESH_FAILED');
            isRefreshing = false;
            authService.logoutOnce('refresh failed', isEssPath);
            return throwError(() => refreshError);
          }),
          tap((newToken) => {
            // This side effect must live upstream of shareReplay so it still
            // runs when the original request has timed out and unsubscribed.
            refreshTokenSubject.next(newToken);
            isRefreshing = false;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );

        return refresh$.pipe(
          switchMap((newToken) => {
            if (!isIdempotent) {
              return throwError(() => error);
            }
            // Retry original request with the new token (idempotent only)
            return next(req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            }));
          }),
        );
      }

      // Refresh already in flight — queue behind it
      return refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap((token) => {
          if (token === 'REFRESH_FAILED') {
            return throwError(() => error);
          }
          if (!isIdempotent) {
            return throwError(() => error);
          }
          return next(req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          }));
        }),
      );
    }),
  );
}
