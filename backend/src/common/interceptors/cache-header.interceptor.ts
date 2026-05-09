import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { CACHE_CONTROL_KEY } from '../decorators/cache-control.decorator';

/**
 * Sets Cache-Control headers on responses.
 * - If a handler is decorated with @CacheControl(), use its max-age/scope.
 * - Otherwise, default to no-cache for safety.
 */
@Injectable()
export class CacheHeaderInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<{ maxAge: number; scope: string }>(
      CACHE_CONTROL_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        if (res.headersSent) return;
        if (meta) {
          res.setHeader(
            'Cache-Control',
            `${meta.scope}, max-age=${meta.maxAge}`,
          );
        } else {
          res.setHeader(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate',
          );
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }),
    );
  }
}
