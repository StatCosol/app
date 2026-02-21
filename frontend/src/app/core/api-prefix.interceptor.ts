import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

const LEGACY_PREFIX = '/api';
const VERSIONED_PREFIX = '/api/v1';

@Injectable()
export class ApiPrefixInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let url = req.url;

    const alreadyVersioned = url === VERSIONED_PREFIX || url.startsWith(`${VERSIONED_PREFIX}/`);

    // Rewrite legacy /api/* calls to /api/v1/* while keeping query strings intact.
    if (!alreadyVersioned) {
      if (url === LEGACY_PREFIX) {
        url = VERSIONED_PREFIX;
      } else if (url.startsWith(`${LEGACY_PREFIX}/`)) {
        url = `${VERSIONED_PREFIX}${url.slice(LEGACY_PREFIX.length)}`;
      }
    }

    if (url === req.url) {
      return next.handle(req);
    }

    const updated = req.clone({ url });
    return next.handle(updated);
  }
}
