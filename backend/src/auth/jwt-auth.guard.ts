import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const url: string = (req?.url || '').toLowerCase();
    const publicPrefixes = [
      '/api/auth/login',
      '/api/v1/auth/login',
      '/auth/login',

      '/api/auth/ess/login',
      '/api/v1/auth/ess/login',

      '/api/auth/refresh',
      '/api/v1/auth/refresh',

      '/api/auth/password/request-reset',
      '/api/v1/auth/password/request-reset',

      '/api/auth/password/reset',
      '/api/v1/auth/password/reset',

      '/health',
      '/api/health',
    ];

    // Allow unauthenticated access to login (and keep future public paths simple)
    if (publicPrefixes.some((prefix) => url.startsWith(prefix))) {
      return true;
    }

    return super.canActivate(context);
  }
}
