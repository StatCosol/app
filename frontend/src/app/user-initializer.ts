import { APP_INITIALIZER, Provider } from '@angular/core';
import { AuthService } from './core/auth.service';
import { firstValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export function initUserFactory(auth: AuthService) {
  return () => {
    // Try to fetch user info if token exists but user is missing
    const token = auth.getAccessToken();
    const user = auth.getUser();
    if (token && !user) {
      // Returns a promise so APP_INITIALIZER waits.
      // On failure (expired token, network error), silently clear auth
      // instead of calling logoutOnce() which triggers router.navigate()
      // during bootstrap (before the router is fully initialized).
      return firstValueFrom(
        auth.fetchMe().pipe(
          timeout(8000),
          catchError(() => {
            // Clear stale token so guards redirect naturally after boot
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            return of(null);
          }),
        ),
      );
    }
    return Promise.resolve();
  };
}

export const userInitializerProvider: Provider = {
  provide: APP_INITIALIZER,
  useFactory: initUserFactory,
  deps: [AuthService],
  multi: true,
};
