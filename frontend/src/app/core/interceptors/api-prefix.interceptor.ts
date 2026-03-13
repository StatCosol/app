import { HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

const LEGACY_PREFIX = '/api';
const VERSIONED_PREFIX = '/api/v1';

function rewriteRelativeUrl(url: string): string {
  const alreadyVersioned =
    url === VERSIONED_PREFIX || url.startsWith(`${VERSIONED_PREFIX}/`);
  if (alreadyVersioned) return url;

  if (url === LEGACY_PREFIX) return VERSIONED_PREFIX;
  if (url.startsWith(`${LEGACY_PREFIX}/`)) {
    return `${VERSIONED_PREFIX}${url.slice(LEGACY_PREFIX.length)}`;
  }

  return url;
}

function rewriteAbsoluteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const alreadyVersioned =
      path === VERSIONED_PREFIX || path.startsWith(`${VERSIONED_PREFIX}/`);
    if (alreadyVersioned) return url;

    if (path === LEGACY_PREFIX) {
      parsed.pathname = VERSIONED_PREFIX;
      return parsed.toString();
    }

    if (path.startsWith(`${LEGACY_PREFIX}/`)) {
      parsed.pathname = `${VERSIONED_PREFIX}${path.slice(LEGACY_PREFIX.length)}`;
      return parsed.toString();
    }

    return url;
  } catch {
    return url;
  }
}

function rewriteUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return rewriteAbsoluteUrl(url);
  }
  return rewriteRelativeUrl(url);
}

export function apiPrefixInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const rewritten = rewriteUrl(req.url);
  if (rewritten === req.url) return next(req);
  return next(req.clone({ url: rewritten }));
}

