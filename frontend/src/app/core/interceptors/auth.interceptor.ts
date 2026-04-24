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
  finalize,
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

  let authReq = req;
  if (accessToken) {
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
          switchMap((newToken) => {
            refreshTokenSubject.next(newToken);
            return next(req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            }));
          }),
          catchError((refreshError) => {
            refreshTokenSubject.next('REFRESH_FAILED');
            authService.logoutOnce('refresh failed', isEssPath);
            return throwError(() => refreshError);
          }),
          finalize(() => {
            isRefreshing = false;
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
