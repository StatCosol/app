import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Restricts access to LegitX Client master users only (no branch users).
 * Requires roleCode=CLIENT and userType=MASTER with a clientId.
 */
@Injectable()
export class ClientMasterGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: any }>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (user.roleCode !== 'CLIENT' || user.userType !== 'MASTER' || !user.clientId) {
      throw new ForbiddenException('Only client master users can access this resource');
    }

    return true;
  }
}
