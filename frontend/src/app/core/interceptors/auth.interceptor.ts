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
  switchMap,
  take,
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

      const refreshToken = authService.getRefreshToken();
      if (!refreshToken) {
        authService.logoutOnce('no refresh token', isEssPath);
        return throwError(() => error);
      }

      // First 401 triggers the refresh; concurrent 401s wait for the result
      if (!isRefreshing) {
        isRefreshing = true;
        refreshTokenSubject.next(null);

        return authService.refreshAccessToken().pipe(
          // Logout ONLY on refresh failure — not on retry failure
          catchError((refreshError) => {
            refreshTokenSubject.next('REFRESH_FAILED');
            isRefreshing = false;
            authService.logoutOnce('refresh failed', isEssPath);
            return throwError(() => refreshError);
          }),
          switchMap((newToken) => {
            refreshTokenSubject.next(newToken);
            isRefreshing = false;
            // Retry original request with the new token
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
          return next(req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          }));
        }),
      );
    }),
  );
}
