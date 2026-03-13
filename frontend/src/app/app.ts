import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/toast/toast-host.component';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog/confirm-dialog.component';
import { IdleTimeoutService } from './core/idle-timeout.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, ConfirmDialogComponent],
  template: `
    <app-toast-host></app-toast-host>
    <app-confirm-dialog></app-confirm-dialog>
    <router-outlet></router-outlet>
  `,
})
export class App {
  constructor(private idleTimeout: IdleTimeoutService) {
    this.idleTimeout.start();
  }
}
