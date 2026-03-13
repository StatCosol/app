import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AssignmentsService } from './assignments.service';
import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for auditor-scoped guards. Allows controllers to override
 * the clientId param name.
 */
export const AUDITOR_CLIENT_PARAM_KEY = 'AUDITOR_CLIENT_PARAM_KEY';

/**
 * Decorator to declare which route param/query/body field carries the
 * clientId for AUDITOR endpoints. Defaults to `clientId`.
 */
export const AuditorClientScoped = (paramKey = 'clientId') =>
  SetMetadata(AUDITOR_CLIENT_PARAM_KEY, paramKey);

/**
 * Guard to ensure the authenticated AUDITOR user is assigned to the
 * requested client. Non-AUDITOR roles (ADMIN, CEO, CCO) pass through.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, RolesGuard, AuditorAssignmentGuard)
 *   @AuditorClientScoped('clientId')
 */
@Injectable()
export class AuditorAssignmentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const user = req?.user as
      | { userId?: string; roleCode?: string }
      | undefined;

    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.roleCode !== 'AUDITOR') {
      // Non-AUDITOR roles are not subject to auditor-assignment checks.
      return true;
    }

    const paramKey =
      this.reflector.get<string>(
        AUDITOR_CLIENT_PARAM_KEY,
        context.getHandler(),
      ) ??
      this.reflector.get<string>(
        AUDITOR_CLIENT_PARAM_KEY,
        context.getClass(),
      ) ??
      'clientId';

    const clientId =
      req?.params?.[paramKey] ??
      req?.query?.[paramKey] ??
      req?.body?.[paramKey];

    if (!clientId) {
      // When absent, skip the check and let the service layer handle scoping.
      return true;
    }

    const isAssigned = await this.assignmentsService.isClientAssignedToAuditor(
      clientId,
      user.userId,
    );

    if (!isAssigned) {
      Logger.warn(
        `AuditorAssignmentGuard: user ${user.userId} not assigned to client ${clientId}`,
        'AuditorAssignmentGuard',
      );
      throw new ForbiddenException(
        'Client is not assigned to this Auditor user',
      );
    }

    return true;
  }
}
