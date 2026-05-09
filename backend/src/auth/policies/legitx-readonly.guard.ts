import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Allows only CLIENT master users (LegitX) and blocks branch users outright.
 * Use on all LegitX compliance endpoints to guarantee view/download-only access.
 */
@Injectable()
export class LegitxReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: any }>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (user.userType === 'BRANCH') {
      throw new ForbiddenException('Branch users are not allowed in LegitX');
    }

    if (user.roleCode !== 'CLIENT' || user.userType !== 'MASTER') {
      throw new ForbiddenException(
        'Only client master users can access LegitX compliance endpoints',
      );
    }

    return true;
  }
}
