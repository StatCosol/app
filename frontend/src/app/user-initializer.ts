import { APP_INITIALIZER, Provider } from '@angular/core';
import { AuthService } from './core/auth.service';
import { firstValueFrom } from 'rxjs';

export function initUserFactory(auth: AuthService) {
  return () => {
    // Try to fetch user info if token exists but user is missing
    const token = auth.getAccessToken();
    const user = auth.getUser();
    if (token && !user) {
      // Returns a promise so APP_INITIALIZER waits
      return firstValueFrom(auth.fetchMe()).catch(() => {});
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
