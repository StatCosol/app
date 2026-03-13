import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-host">
      <div
        *ngFor="let toast of toastService.toasts$ | async"
        class="toast"
        [class.toast-success]="toast.type === 'success'"
        [class.toast-error]="toast.type === 'error'"
        [class.toast-warning]="toast.type === 'warning'"
        [class.toast-info]="toast.type === 'info'"
      >
        <div class="toast-header">
          <strong>{{ toast.title }}</strong>
          <button type="button" class="toast-close" (click)="remove(toast.id)">
            ×
          </button>
        </div>
        <div class="toast-body">{{ toast.message }}</div>
      </div>
    </div>
  `,
  styles: [
    `
      .toast-host {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 360px;
        max-width: calc(100vw - 32px);
      }

      .toast {
        border-radius: 10px;
        padding: 12px 14px;
        color: #fff;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      }

      .toast-success {
        background: #198754;
      }

      .toast-error {
        background: #dc3545;
      }

      .toast-warning {
        background: #fd7e14;
      }

      .toast-info {
        background: #0d6efd;
      }

      .toast-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .toast-close {
        border: 0;
        background: transparent;
        color: #fff;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }

      .toast-body {
        white-space: pre-line;
        font-size: 14px;
      }
    `,
  ],
})
export class ToastHostComponent {
  constructor(public readonly toastService: ToastService) {}

  remove(id: string): void {
    this.toastService.remove(id);
  }
}
