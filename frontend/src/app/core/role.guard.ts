import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const roleGuard = (roles: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // If not logged in, go to login
    if (!auth.isLoggedIn || !auth.isLoggedIn()) {
      return router.parseUrl('/login');
    }

    const role = auth.getRoleCode();

    // If role not allowed, redirect (you can change target to /not-authorized if you have one)
    if (!roles.includes(role)) {
      return router.parseUrl('/login');
    }

    return true;
  };
};
