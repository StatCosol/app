import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReqUser } from '../access/access-scope.service';
import { ReportRange } from './facedesk-reports.service';

export function facedeskBranchScope(user: ReqUser): string[] | null {
  return user?.roleCode === 'CLIENT' && user?.userType === 'BRANCH'
    ? (user.branchIds ?? [])
    : null;
}

export function requireFaceDeskClient(user: ReqUser): string {
  const clientId = user?.clientId;
  if (!clientId) throw new BadRequestException('Client context required');
  return clientId;
}

export function requireFaceDeskClientAdmin(user: ReqUser): string {
  if (facedeskBranchScope(user) !== null) {
    throw new ForbiddenException('Client administrator access required');
  }
  return requireFaceDeskClient(user);
}

/** Biometric photos are branch-verifier only (DPDP / least-privilege). */
export function requireFaceDeskBranchVerifier(user: ReqUser): string[] {
  const scope = facedeskBranchScope(user);
  if (scope === null) {
    throw new ForbiddenException(
      'Branch verification access required to view biometric photos',
    );
  }
  return scope;
}

export function facedeskVerificationPhotosAllowed(user: ReqUser): boolean {
  return facedeskBranchScope(user) !== null;
}

export function facedeskReportRange(
  user: ReqUser,
  from?: string,
  to?: string,
): ReportRange {
  return { from, to, branchIds: facedeskBranchScope(user) ?? undefined };
}

export function facedeskSubjectType(
  subjectType?: string,
): 'EMPLOYEE' | 'CONTRACTOR' {
  return subjectType === 'CONTRACTOR' ? 'CONTRACTOR' : 'EMPLOYEE';
}
