import 'zone.js';
import { Component, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { of } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditorLayoutComponent } from './auditor-layout.component';
import { AuthService } from '../../../core/auth.service';
import { NewsService } from '../../../shared/services/news.service';

@Component({ selector: 'app-test-auditor-root', standalone: true, imports: [RouterOutlet], template: '<router-outlet />' })
class Root {}
@Component({ standalone: true, template: 'TEST destination' })
class Destination {}

it.each([390, 768, 1280])('handles first navigation with production event scheduling at %s px', async width => {
  await page.viewport(width, 900);
  const host = document.createElement('app-test-auditor-root'); document.body.append(host);
  const app = await bootstrapApplication(Root, { providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter([{ path: 'auditor', component: AuditorLayoutComponent, children: [{ path: '**', component: Destination }] }, { path: '**', component: Destination }]),
    { provide: AuthService, useValue: { getUser: () => ({ name: 'TEST Auditor' }), hasModule: () => true } },
    { provide: NewsService, useValue: { getActiveNews: () => of([]) } },
  ] });
  try {
    const router = app.injector.get(Router);
    await router.navigateByUrl('/auditor/dashboard');
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await expect.element(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Audit Work', exact: true }).click();
    await expect.element(page.getByRole('link', { name: 'Select Audit Scope', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Select Audit Scope', exact: true }).click();
    await expect.poll(() => router.url).toBe('/auditor/conduct-audit');
    if (width < 1024) {
      await expect.element(page.getByRole('dialog', { name: 'Navigation', exact: true })).not.toBeInTheDocument();
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await expect.element(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
      await expect.element(page.getByRole('dialog', { name: 'Navigation', exact: true })).not.toBeInTheDocument();
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    }
    await expect.element(page.getByRole('link', { name: 'Select Audit Scope', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(host.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  } finally { app.destroy(); host.remove(); }
});
