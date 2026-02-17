import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const branchPortalGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return router.parseUrl('/login');
  if (auth.getRoleCode() !== 'CLIENT') return router.parseUrl('/login');
  if (!auth.isBranchUser()) return router.parseUrl('/client');

  return true;
};
