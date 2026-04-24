import {
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { from, Observable, of, switchMap, map } from 'rxjs';
import { CryptoService } from '../crypto.service';

/** URLs that should never be encrypted (auth, file uploads, SAS tokens) */
const SKIP_PATTERNS = [
  /\/auth\/(login|ess\/login|refresh|logout|forgot-password|verify-reset-token|reset-password)/,
  /\/files\/(sas-token|upload|download)/,
];

function shouldSkip(url: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(url));
}

/**
 * Encrypts outgoing JSON request bodies and decrypts incoming encrypted
 * response bodies using AES-256-GCM via the CryptoService.
 *
 * Encryption is only applied when:
 * - An encryption key is available (set after login)
 * - The request is NOT to a skipped endpoint
 * - The request body is a JSON object (not FormData / Blob / null)
 *
 * Encrypted requests add `X-Encrypted: true` header so the backend knows
 * to decrypt the payload. Encrypted responses are expected to carry the
 * same header for the interceptor to decrypt them.
 */
export function encryptionInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const crypto = inject(CryptoService);

  // Skip if no key or endpoint is excluded
  if (!crypto.hasKey() || shouldSkip(req.url)) {
    return next(req);
  }

  // Only encrypt JSON bodies (skip FormData, Blob, null, etc.)
  const hasJsonBody =
    req.body !== null &&
    req.body !== undefined &&
    typeof req.body === 'object' &&
    !(req.body instanceof FormData) &&
    !(req.body instanceof Blob) &&
    !(req.body instanceof ArrayBuffer);

  const outgoing$: Observable<HttpRequest<unknown>> = hasJsonBody
    ? from(crypto.encrypt(req.body)).pipe(
        map((encrypted) =>
          req.clone({
            body: { payload: encrypted },
            setHeaders: { 'X-Encrypted': 'true', 'Content-Type': 'application/json' },
          }),
        ),
      )
    : of(req);

  return outgoing$.pipe(
    switchMap((encryptedReq) =>
      next(encryptedReq).pipe(
        switchMap((event) => {
          if (
            event instanceof HttpResponse &&
            event.headers.get('X-Encrypted') === 'true' &&
            typeof event.body === 'object' &&
            event.body !== null &&
            'payload' in (event.body as Record<string, unknown>)
          ) {
            return from(
              crypto.decrypt((event.body as Record<string, string>)['payload']),
            ).pipe(
              map((decrypted) => event.clone({ body: decrypted })),
            );
          }
          return of(event);
        }),
      ),
    ),
  );
}
