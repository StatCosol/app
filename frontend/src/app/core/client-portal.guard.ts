import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Keep branch accounts in their own portal, including saved client URLs. */
export const clientPortalGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.parseUrl('/login');
  if (auth.getRoleCode() === 'CLIENT' && auth.isBranchUser()) {
    return router.parseUrl('/branch');
  }
  return true;
};
