import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

/**
 * Roles whose access is granted per client via an assignment, so a clientId on
 * the request must appear in `user.assignedClientIds`.
 *
 * Global roles (ADMIN/CEO/CCO) are absent by design — they see everything.
 * CLIENT/BRANCH_DESK/CONTRACTOR/EMPLOYEE are absent because their tenancy comes
 * from `user.clientId` rather than an assignment list.
 */
const ASSIGNED_ROLES = ['CRM', 'PAYROLL', 'AUDITOR', 'PAYDEK'];

/**
 * Roles whose tenancy is a single client carried on the token itself. A
 * clientId on the request must equal `user.clientId` — these users have
 * exactly one company and can never legitimately name another.
 */
const TENANT_ROLES = ['CLIENT', 'BRANCH_DESK', 'CONTRACTOR', 'EMPLOYEE'];

/**
 * ScopeGuard attaches `req.accessScope` derived from the authenticated user
 * so that downstream services can enforce ownership/assignment restrictions.
 *
 * It also hard-denies a tenant-scoped role that names a client it is not
 * assigned to (see {@link ASSIGNED_ROLES}).
 *
 * **Known limit worth understanding before relying on it:** the guard can only
 * check a clientId that is actually on the request. An endpoint that takes no
 * clientId and returns data across clients is invisible to it — that is how
 * `GET /crm/users/contractors` leaked every tenant's contractors until the
 * parameter was made mandatory. Endpoints must still scope their own queries;
 * this guard is a backstop, not the primary control.
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

    const clientId =
      req.params?.clientId || req.query?.clientId || req.body?.clientId;

    // Hard check: a tenant-scoped role may only name a client it is assigned
    // to. An empty assignment set denies rather than falls through — an empty
    // array previously granted access to any client.
    //
    // AUDITOR and PAYDEK are included because they are assigned per client in
    // exactly the same way; leaving them out meant they could pass any
    // clientId and be served another tenant's data.
    if (ASSIGNED_ROLES.includes(user.roleCode) && clientId) {
      const assigned = Array.isArray(user.assignedClientIds)
        ? user.assignedClientIds
        : [];
      if (assigned.length === 0 || !assigned.includes(clientId)) {
        Logger.warn(
          `ScopeGuard: ${user.roleCode} user ${user.id} blocked from client ${clientId}`,
          'ScopeGuard',
        );
        throw new ForbiddenException(
          `${user.roleCode} is not assigned to this client`,
        );
      }
    }

    // Hard check: a role whose tenancy is its own `user.clientId` may only
    // ever name that client. Previously unchecked, which meant a CLIENT user
    // could pass another company's clientId to any endpoint that reads the
    // parameter and be served their data — the assignment check above does
    // not apply to these roles, so nothing was validating them at all.
    if (TENANT_ROLES.includes(user.roleCode) && clientId && user.clientId) {
      if (clientId !== user.clientId) {
        Logger.warn(
          `ScopeGuard: ${user.roleCode} user ${user.id} blocked from client ${clientId}`,
          'ScopeGuard',
        );
        throw new ForbiddenException('Client not in scope');
      }
    }

    return true;
  }
}
