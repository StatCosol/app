import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ServiceEntitlementsService } from './service-entitlements.service';
import { ServiceModuleCode } from './service-entitlements.constants';

type ServiceModuleRequirement = ServiceModuleCode | ServiceModuleCode[];

const BLOCKED_ROUTE_MODULES: Array<[RegExp, ServiceModuleRequirement]> = [
  [/^\/?(api\/v1\/)?client\/contractors\/dashboard\b/i, 'CONTRACTOR_AUDIT'],
  [/^\/?(api\/v1\/)?client\/contractors\b/i, ['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS']],
  [/^\/?(api\/v1\/)?client\/contractor-employees\b/i, ['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS']],
  [/^\/?(api\/v1\/)?client\/contractor-required-documents\b/i, 'CONTRACTOR_DOCUMENTS'],
  [/^\/?(api\/v1\/)?contractor\/(dashboard|compliance|documents|employees|audits|audit-non-compliances|computation)\b/i, 'CONTRACTOR_PORTAL'],
  [/^\/?(api\/v1\/)?(payroll|client\/payroll|branch\/payroll)\b/i, 'PAYROLL'],
  [/^\/?(api\/v1\/)?client-dashboard\/pf-esi-summary\b/i, 'PAYROLL'],
  [/^\/?(api\/v1\/)?client-dashboard\/contractor-upload-summary\b/i, 'CONTRACTOR_DOCUMENTS'],
  [/^\/?(api\/v1\/)?client\/dashboard\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/employees\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?employees\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/master-data\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/attendance\b/i, 'EMPLOYEE_ATTENDANCE'],
  [/^\/?(api\/v1\/)?appraisal\b/i, 'APPRAISAL'],
  [/^\/?(api\/v1\/)?client\/approvals\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/nominations\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?branch-approvals\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/branches\/documents\/[^/]+\/reupload\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/branches\/registration-(summary|alerts)\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/branches\/[^/]+\/(documents|mcd|registrations|registration-summary)\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/branches\/[^/]+\/audit-observations\b/i, 'CONTRACTOR_AUDIT'],
  [/^\/?(api\/v1\/)?client\/branches\b/i, ['EMPLOYEE_COMPLIANCE', 'CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS']],
  [/^\/?(api\/v1\/)?client\/compliance\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/branch-compliance\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?branch\/compliance-docs\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?branch\/uploads\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/returns\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?returns\/upload\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/unit-documents\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?branch\/unit-documents\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/safety-documents\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?branch\/safety-documents\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?client\/notices\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?branch\/notices\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?calendar\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?risk\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?sla\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?escalations\b/i, 'EMPLOYEE_COMPLIANCE'],
  [/^\/?(api\/v1\/)?compliance-notifications\b/i, 'EMPLOYEE_COMPLIANCE'],
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

    const requirement = match[1];
    if (Array.isArray(requirement)) {
      await this.entitlements.assertAnyModule(user.clientId, requirement);
    } else {
      await this.entitlements.assertModule(user.clientId, requirement);
    }
    return true;
  }
}
