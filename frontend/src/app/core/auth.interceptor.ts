import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ToastService } from '../shared/toast/toast.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
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
            this.toast.error('Network connection lost or server is unreachable.');
            return throwError(() => err);
          }
          if (err.status === 401) {
            this.toast.error('Unauthorized: Please log in again.');
            const isEss =
              this.auth.getRoleCode() === 'EMPLOYEE' ||
              window.location.pathname.startsWith('/ess/');
            this.auth.logoutOnce('401 Unauthorized', isEss);
          } else if (err.status === 403) {
            this.toast.error('Forbidden: You do not have access to this page.');
          } else {
            const msg =
              (err.error && err.error.message) ||
              err.message ||
              'Request failed';
            this.toast.error(msg);
          }
        }
        return throwError(() => err);
      })
    );
  }
}
