import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CrmService } from './crm.service';

/**
 * Guard that blocks navigation when the requested clientId is not assigned to the CRM user.
 * Redirects to /crm/clients with a denial flag instead of leaving the UI blank.
 */
export const crmClientAccessGuard: CanActivateFn = (route) => {
  const clientId = route.paramMap.get('clientId');
  const router = inject(Router);
  const crmService = inject(CrmService);

  if (!clientId) {
    return router.createUrlTree(['/crm/clients'], {
      queryParams: { denied: 'client-missing' },
    });
  }

  const redirect = (): UrlTree =>
    router.createUrlTree(['/crm/clients'], {
      queryParams: { denied: 'client' },
    });

  return crmService.getAssignedClientsCached().pipe(
    map((clients) => {
      const match = (clients || []).some(
        (c: any) => c?.id === clientId || c?.clientId === clientId,
      );
      return match ? true : redirect();
    }),
    catchError(() => of(redirect())),
  );
};
