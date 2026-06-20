import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ServiceEntitlementsService } from './service-entitlements.service';
import { ServiceModuleCode } from './service-entitlements.constants';

const BLOCKED_ROUTE_MODULES: Array<[RegExp, ServiceModuleCode]> = [
  [/^\/?(api\/v1\/)?(payroll|client\/payroll|branch\/payroll)\b/i, 'PAYROLL'],
  [/^\/?(api\/v1\/)?client\/employees\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?employees\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/attendance\b/i, 'EMPLOYEE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?appraisal\b/i, 'APPRAISAL'],
  [/^\/?(api\/v1\/)?client\/biometric\b/i, 'MOBILE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?client\/mobile-attendance\b/i, 'MOBILE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?mobile-attendance\/devices\b/i, 'CONTRACTOR_FACE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?mobile-attendance\/enrollment\/employees\b/i, 'MOBILE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?mobile-attendance\/enrollment\/contractors\b/i, 'CONTRACTOR_FACE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?mobile-attendance\/punches\/contractor\b/i, 'CONTRACTOR_ATTENDANCE'],
];

@Injectable()
export class ServiceEntitlementsGuard implements CanActivate {
  constructor(private readonly entitlements: ServiceEntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const user = req.user;
    if (!user?.clientId) return true;

    const role = String(user.roleCode || '');
    if (!['CLIENT', 'CONTRACTOR', 'EMPLOYEE'].includes(role)) return true;

    const path = String(req.originalUrl || req.url || '')
      .replace(/\?.*$/, '')
      .replace(/^\/+/, '');

    const match = BLOCKED_ROUTE_MODULES.find(([pattern]) => pattern.test(path));
    if (!match) return true;

    await this.entitlements.assertModule(user.clientId, match[1]);
    return true;
  }
}
