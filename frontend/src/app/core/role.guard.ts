import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const roleGuard = (roles: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // If not logged in, redirect to appropriate login page
    if (!auth.isLoggedIn || !auth.isLoggedIn()) {
      // Employee routes or current ESS URL -> ESS login; everything else -> main login
      if (roles.includes('EMPLOYEE') || window.location.pathname.startsWith('/ess/')) {
        return router.parseUrl('/ess/login');
      }
      return router.parseUrl('/login');
    }

    const role = auth.getRoleCode();

    // If role not allowed, redirect to the correct dashboard for the user's actual role
    if (!roles.includes(role)) {
      // Use the centralized redirect map from AuthService
      const redirectPath = auth.getRoleRedirectPath(role);
      if (redirectPath) {
        return router.parseUrl(redirectPath);
      }
      // Unknown role — go to login
      return router.parseUrl('/login');
    }

    return true;
  };
};
