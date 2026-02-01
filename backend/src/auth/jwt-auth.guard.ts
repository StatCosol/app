import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const url: string = (req?.url || '').toLowerCase();
    const publicPrefixes = [
      '/api/auth/login',
      '/auth/login',
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
