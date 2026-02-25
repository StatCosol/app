
import { ApplicationConfig } from '@angular/core';
import { userInitializerProvider } from './user-initializer';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { AuthInterceptor } from './core/auth.interceptor';
import { ApiPrefixInterceptor } from './core/api-prefix.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withRouterConfig({ onSameUrlNavigation: 'reload' })),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: ApiPrefixInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    provideAnimations(),
    userInitializerProvider,
  ],
};
