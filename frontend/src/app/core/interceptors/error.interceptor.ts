import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/toast/toast.service';
import { ApiErrorResponse } from '../models/api-response.model';

/** Set to true on requests where the caller handles errors gracefully and
 *  should not show the global "Request Failed" toast on failure. */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export function errorInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const apiError = error.error as ApiErrorResponse | null;
      let message = 'Something went wrong. Please try again.';
      let title = 'Request Failed';

      if (apiError && typeof apiError === 'object') {
        if (Array.isArray(apiError.message)) {
          message = apiError.message.join('\n');
        } else if (typeof apiError.message === 'string' && apiError.message.trim()) {
          message = apiError.message;
        }

        if (typeof apiError.error === 'string' && apiError.error.trim()) {
          title = apiError.error;
        }
      } else if (typeof error.message === 'string' && error.message.trim()) {
        message = error.message;
      }

      if (error.status === 0) {
        title = 'Network Error';
        message = 'Unable to connect to server.';
      }

      if (error.status !== 401 && !req.context.get(SKIP_ERROR_TOAST)) {
        toast.error(title, message);
      }

      return throwError(() => error);
    }),
  );
}
