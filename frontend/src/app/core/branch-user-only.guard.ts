import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Route guard that blocks CLIENT master users.
 * Only branch users (with 1+ mapped branches) can access the guarded route.
 * Master users are redirected to the MCD overview page.
 */
export const branchUserOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Non-CLIENT users pass through (guard only applies to CLIENT role)
  if (auth.getRoleCode() !== 'CLIENT') return true;

  // Branch users pass
  if (auth.isBranchUser()) return true;

  // Master users are redirected to the MCD view-only page
  if (auth.isMasterUser()) {
    return router.parseUrl('/client/compliance/mcd');
  }

  // Fallback: allow if userType not yet determined (pre-fetchMe)
  return true;
};
