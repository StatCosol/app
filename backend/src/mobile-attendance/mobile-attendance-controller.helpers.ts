import { BadRequestException } from '@nestjs/common';
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
