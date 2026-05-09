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
    const user = req.user as
      | { roleCode?: string; userType?: string }
      | undefined; // set by JwtStrategy validate()

    if (!user || typeof user.roleCode !== 'string') {
      Logger.warn(
        `RolesGuard: missing roleCode for requiredRoles=${requiredRoles.join(',')}`,
        'RolesGuard',
      );
      throw new ForbiddenException('Role not found on token');
    }

    // Build the effective roles for this user.
    // CLIENT users with userType=BRANCH also match the BRANCH_DESK virtual role
    // so that @Roles('BRANCH_DESK') controllers are accessible to branch users.
    // PAYROLL users also match the PAYDEK virtual role for paydek-prefixed endpoints.
    const effectiveRoles: string[] = [user.roleCode];
    if (user.roleCode === 'CLIENT' && user.userType === 'BRANCH') {
      effectiveRoles.push('BRANCH_DESK');
    }
    if (user.roleCode === 'PAYROLL') {
      effectiveRoles.push('PAYDEK');
    }

    const hasRole = requiredRoles.some((r) => effectiveRoles.includes(r));

    if (!hasRole) {
      Logger.warn(
        `RolesGuard: forbidden roleCode=${user.roleCode} userType=${user.userType ?? 'null'} requiredRoles=${requiredRoles.join(',')}`,
        'RolesGuard',
      );
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }
    return true;
  }
}
