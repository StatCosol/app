import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const moduleAccessGuard = (moduleCode: string): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.hasModule(moduleCode)) return true;
    const fallback = window.location.pathname.startsWith('/branch')
      ? '/branch/dashboard'
      : '/client/dashboard';
    return router.parseUrl(fallback);
  };
};
