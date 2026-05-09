import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ClientPayrollSettingsService } from './client-payroll-settings.service';

/**
 * Route guard that blocks branch users from accessing payroll
 * unless the client master user has granted `allowBranchPayrollAccess`.
 *
 * Master users always pass through.
 */
export const branchPayrollAccessGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const settingsSvc = inject(ClientPayrollSettingsService);

  // Non-CLIENT roles or master users always pass
  if (auth.getRoleCode() !== 'CLIENT' || auth.isMasterUser()) {
    return true;
  }

  // Branch user — check access toggle
  return settingsSvc.get().pipe(
    map(settings => {
      if (settings?.allowBranchPayrollAccess) {
        return true;
      }
      // Redirect to appropriate dashboard
      const currentUrl = router.routerState.snapshot.url;
      const fallback = currentUrl.startsWith('/branch') ? '/branch/dashboard' : '/client/dashboard';
      return router.createUrlTree([fallback]);
    }),
    catchError(() => {
      const currentUrl = router.routerState.snapshot.url;
      const fallback = currentUrl.startsWith('/branch') ? '/branch/dashboard' : '/client/dashboard';
      return of(router.createUrlTree([fallback]));
    }),
  );
};
