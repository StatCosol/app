import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const moduleAccessGuard = (moduleCode: string | string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const allowed = Array.isArray(moduleCode)
      ? auth.hasAnyModule(moduleCode)
      : auth.hasModule(moduleCode);
    if (allowed) return true;
    const fallback = window.location.pathname.startsWith('/branch')
      ? '/branch/dashboard'
      : '/client/dashboard';
    return router.parseUrl(fallback);
  };
};
