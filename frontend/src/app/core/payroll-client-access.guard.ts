import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PayrollApiService } from '../pages/payroll/payroll-api.service';

/**
 * Guard that blocks navigation when the requested clientId is not assigned to the Payroll user.
 * Redirects to /payroll/clients with a denial flag.
 */
export const payrollClientAccessGuard: CanActivateFn = (route) => {
  const clientId = route.paramMap.get('clientId');
  const router = inject(Router);
  const payrollApi = inject(PayrollApiService);

  if (!clientId) {
    return router.createUrlTree(['/payroll/clients'], {
      queryParams: { denied: 'client-missing' },
    });
  }

  const redirect = (): UrlTree =>
    router.createUrlTree(['/payroll/clients'], {
      queryParams: { denied: 'client' },
    });

  return payrollApi.getAssignedClients().pipe(
    map((clients) => {
      const match = (clients || []).some(
        (c: any) => c?.id === clientId || c?.clientId === clientId,
      );
      return match ? true : redirect();
    }),
    catchError(() => of(redirect())),
  );
};
