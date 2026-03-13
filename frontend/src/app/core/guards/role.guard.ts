import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = (route.data?.['roles'] ?? []) as string[];
  const currentRole = (authService.getCurrentRole() ?? '').toUpperCase();

  if (!allowedRoles.length) {
    return true;
  }

  const normalizedAllowed = allowedRoles.map((r) => String(r).toUpperCase());
  if (normalizedAllowed.includes(currentRole)) {
    return true;
  }

  return router.createUrlTree(['/unauthorized']);
};
