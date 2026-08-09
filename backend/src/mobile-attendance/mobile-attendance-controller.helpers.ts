import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReqUser } from '../access/access-scope.service';

export function requireMobileAttendanceClient(user: ReqUser): string {
  const clientId = user?.clientId;
  if (!clientId) throw new BadRequestException('Client context required');
  return clientId;
}

export function mobileAttendanceBranchScope(user: ReqUser): string[] | null {
  return user?.roleCode === 'CLIENT' && user?.userType === 'BRANCH'
    ? (user.branchIds ?? [])
    : null;
}

/** Biometric photos are branch-verifier only (DPDP / least-privilege). */
export function requireMobileAttendanceBranchVerifier(
  user: ReqUser,
): string[] {
  const scope = mobileAttendanceBranchScope(user);
  if (scope === null) {
    throw new ForbiddenException(
      'Branch verification access required to view biometric photos',
    );
  }
  return scope;
}

export function mobileAttendanceVerificationPhotosAllowed(
  user: ReqUser,
): boolean {
  return mobileAttendanceBranchScope(user) !== null;
}

/** Strip biometric photo hints from list payloads for non-branch callers. */
export function redactMobileAttendancePhotoFields<
  T extends { photoUrl?: string | null },
>(rows: T[], allowed: boolean): T[] {
  if (allowed) return rows;
  return rows.map((row) => ({ ...row, photoUrl: null }));
}
