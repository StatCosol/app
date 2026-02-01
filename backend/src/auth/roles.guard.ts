import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const user = req.user as { roleCode?: string } | undefined; // set by JwtStrategy validate()

    if (!user || typeof user.roleCode !== 'string') {
      Logger.warn(
        `RolesGuard: missing roleCode for requiredRoles=${requiredRoles.join(',')}`,
        'RolesGuard',
      );
      throw new ForbiddenException('Role not found on token');
    }

    if (!requiredRoles.includes(user.roleCode)) {
      Logger.warn(
        `RolesGuard: forbidden roleCode=${user.roleCode} requiredRoles=${requiredRoles.join(',')}`,
        'RolesGuard',
      );
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }
    return true;
  }
}
