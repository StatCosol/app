import { HttpEvent, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiSuccessResponse } from '../models/api-response.model';

export function apiResponseInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  return next(req).pipe(
    map((event) => {
      if (event instanceof HttpResponse) {
        const body = event.body as ApiSuccessResponse<any> | null;

        if (
          body &&
          typeof body === 'object' &&
          body.success === true &&
          'data' in body
        ) {
          return event.clone({
            body: body.data,
          });
        }
      }

      return event;
    }),
  );
}
