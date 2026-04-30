import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/toast/toast-host.component';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog/confirm-dialog.component';
import { IdleTimeoutService } from './core/idle-timeout.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmDialogComponent],
  template: `
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-white focus:text-indigo-700 focus:rounded-lg focus:shadow-lg focus:font-semibold">
      Skip to main content
    </a>
    <main id="main-content">
      <router-outlet />
    </main>
    <app-toast-host />
    <app-confirm-dialog />
  `,
})
export class AppComponent {
  constructor(private idleTimeout: IdleTimeoutService) {
    this.idleTimeout.start();
  }
}
