import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, Subject } from 'rxjs';
import { catchError, filter, switchMap, take, finalize } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ToastService } from '../shared/toast/toast.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  /** Whether a refresh is currently in flight */
  private isRefreshing = false;
  /** Emits the new access token once refresh completes (null while waiting) */
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(private auth: AuthService, private toast: ToastService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.getAccessToken();

    // Attach token if present
    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(authReq).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          if (err.status === 0) {
            this.toast.error('Network Error', 'Network connection lost or server is unreachable.');
            return throwError(() => err);
          }

          // 401 — try to silently refresh before logging out
          if (err.status === 401 && !this.isAuthUrl(req.url)) {
            // Distinguish 401 cause: if no token exists, skip refresh entirely
            if (!this.auth.getAccessToken() && !this.auth.getRefreshToken()) {
              this.handleSessionExpired();
              return throwError(() => err);
            }
            return this.handle401(req, next);
          }

          if (err.status === 403) {
            this.toast.error('Forbidden', 'You do not have access to this page.');
          } else if (err.status !== 401) {
            const msg =
              (err.error && err.error.message) ||
              err.message ||
              'Request failed';
            this.toast.error('Error', msg);
          }
        }
        return throwError(() => err);
      })
    );
  }

  /** Returns true if the request is to an auth endpoint (login/refresh/logout) */
  private isAuthUrl(url: string): boolean {
    return /\/auth\/(login|refresh|logout|ess\/login)/.test(url);
  }

  /**
   * On 401, attempt a silent token refresh.
   * If a refresh is already in flight, queue requests behind it.
   * Uses a lock pattern to prevent race conditions with concurrent 401s.
   */
  private handle401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      // Reset the Subject so queued requests wait for the new token
      this.refreshTokenSubject.next(null);

      return this.auth.refreshAccessToken().pipe(
        switchMap((newToken: string) => {
          this.refreshTokenSubject.next(newToken);
          return next.handle(
            req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })
          );
        }),
        catchError((refreshErr) => {
          this.refreshTokenSubject.next(null);
          this.handleSessionExpired();
          return throwError(() => refreshErr);
        }),
        finalize(() => {
          this.isRefreshing = false;
        })
      );
    }

    // Another request hit 401 while refresh is in-flight — wait for the refresh to finish
    return this.refreshTokenSubject.pipe(
      filter((token) => token !== null),
      take(1),
      switchMap((token) =>
        next.handle(
          req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        )
      )
    );
  }

  /** Centralized session-expired handler */
  private handleSessionExpired(): void {
    this.toast.error('Session Expired', 'Please log in again.');
    const isEss =
      this.auth.getRoleCode() === 'EMPLOYEE' ||
      window.location.pathname.startsWith('/ess/');
    this.auth.logoutOnce('session expired', isEss);
  }
}
