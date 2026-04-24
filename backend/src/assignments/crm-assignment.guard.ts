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
 * Metadata key for client-scoped guards. Allows controllers to override the clientId param name.
 */
export const CRM_CLIENT_PARAM_KEY = 'CRM_CLIENT_PARAM_KEY';

/**
 * Decorator to declare which route param/query/body field carries the clientId for CRM endpoints.
 * Defaults to `clientId` if not provided.
 */
export const ClientScoped = (paramKey = 'clientId') =>
  SetMetadata(CRM_CLIENT_PARAM_KEY, paramKey);

/**
 * Guard to ensure the authenticated CRM user is assigned to the requested client.
 * Usage: `@UseGuards(JwtAuthGuard, RolesGuard, CrmAssignmentGuard)` + `@ClientScoped('clientId')` on handlers.
 */
@Injectable()
export class CrmAssignmentGuard implements CanActivate {
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

    if (user.roleCode !== 'CRM') {
      // Non-CRM roles (ADMIN, CCO, CEO, AUDITOR) are not subject to
      // CRM assignment checks — allow them through.
      return true;
    }

    const paramKey =
      this.reflector.get<string>(CRM_CLIENT_PARAM_KEY, context.getHandler()) ??
      this.reflector.get<string>(CRM_CLIENT_PARAM_KEY, context.getClass()) ??
      'clientId';

    const clientId =
      req?.params?.[paramKey] ??
      req?.query?.[paramKey] ??
      req?.body?.[paramKey];

    if (!clientId) {
      // clientId is optional on some endpoints (e.g. listing without a filter).
      // When absent, skip the assignment check and let the service layer handle scoping.
      return true;
    }

    const isAssigned = await this.assignmentsService.isClientAssignedToCrm(
      clientId,
      user.userId,
    );

    if (!isAssigned) {
      Logger.warn(
        `CrmAssignmentGuard: user ${user.userId} not assigned to client ${clientId}`,
        'CrmAssignmentGuard',
      );
      throw new ForbiddenException('Client is not assigned to this CRM user');
    }

    return true;
  }
}
