import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

/**
 * ScopeGuard attaches `req.accessScope` derived from the authenticated user
 * so that downstream services can enforce ownership/assignment restrictions.
 *
 * It also performs hard checks for known role+param combinations:
 *  - CRM user accessing a client route must be assigned to that client
 *  - PAYROLL user accessing a client route must be assigned to that client
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) return true; // JwtAuthGuard already handles unauth

    req.accessScope = {
      userId: user.id ?? user.userId ?? null,
      roleCode: user.roleCode ?? null,
      clientId: user.clientId ?? null,
      branchIds: user.branchIds ?? [],
      userType: user.userType ?? null,
    };

    // Hard check: route-level clientId scope for CRM users
    const clientId =
      req.params?.clientId || req.query?.clientId || req.body?.clientId;

    if (
      user.roleCode === 'CRM' &&
      clientId &&
      Array.isArray(user.assignedClientIds) &&
      user.assignedClientIds.length > 0 &&
      !user.assignedClientIds.includes(clientId)
    ) {
      Logger.warn(
        `ScopeGuard: CRM user ${user.id} blocked from client ${clientId}`,
        'ScopeGuard',
      );
      throw new ForbiddenException('CRM is not assigned to this client');
    }

    // Hard check: route-level clientId scope for PAYROLL users
    if (
      user.roleCode === 'PAYROLL' &&
      clientId &&
      Array.isArray(user.assignedClientIds) &&
      user.assignedClientIds.length > 0 &&
      !user.assignedClientIds.includes(clientId)
    ) {
      Logger.warn(
        `ScopeGuard: PAYROLL user ${user.id} blocked from client ${clientId}`,
        'ScopeGuard',
      );
      throw new ForbiddenException(
        'Payroll user is not assigned to this client',
      );
    }

    return true;
  }
}
