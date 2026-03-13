import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth.service';

let isRefreshing = false;

export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const authService = inject(AuthService);

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
      if (error.status !== 401 || authReq.url.includes('/auth/login')) {
        return throwError(() => error);
      }

      const refreshToken = authService.getRefreshToken();
      if (!refreshToken) {
        authService.logoutOnce('no refresh token');
        return throwError(() => error);
      }

      if (isRefreshing) {
        authService.logoutOnce('refresh already in progress');
        return throwError(() => error);
      }

      isRefreshing = true;

      return authService.refreshAccessToken().pipe(
        switchMap((newToken) => {
          isRefreshing = false;

          const retryReq = authReq.clone({
            setHeaders: {
              Authorization: `Bearer ${newToken}`,
            },
          });

          return next(retryReq);
        }),
        catchError((refreshError) => {
          isRefreshing = false;
          authService.logoutOnce('refresh failed');
          return throwError(() => refreshError);
        }),
      );
    }),
  );
}
