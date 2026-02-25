import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const roleGuard = (roles: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // If not logged in, redirect to appropriate login page
    if (!auth.isLoggedIn || !auth.isLoggedIn()) {
      // Employee routes or current ESS URL → ESS login; everything else → main login
      if (roles.includes('EMPLOYEE') || window.location.pathname.startsWith('/ess/')) {
        return router.parseUrl('/ess/login');
      }
      return router.parseUrl('/login');
    }

    const role = auth.getRoleCode();

    // If role not allowed, redirect
    if (!roles.includes(role)) {
      if (role === 'EMPLOYEE') {
        return router.parseUrl('/ess/login');
      }
      return router.parseUrl('/login');
    }

    return true;
  };
};
