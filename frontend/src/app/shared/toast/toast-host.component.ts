import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, timer } from 'rxjs';
import { ToastMsg, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="toast-wrap">
    <div *ngFor="let t of toasts" class="toast" [ngClass]="t.type">
      {{ t.text }}
    </div>
  </div>
  `,
  styles: [`
    .toast-wrap{position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px}
    .toast{min-width:260px;max-width:360px;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);background:#fff;cursor:pointer}
    .toast.success{border-left:4px solid #22c55e}
    .toast.error{border-left:4px solid #ef4444}
    .toast.info{border-left:4px solid #3b82f6}
    .toast.warning{border-left:4px solid #f59e0b}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastHostComponent implements OnInit, OnDestroy {
  toasts: ToastMsg[] = [];
  private sub?: Subscription;

  constructor(private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.toast.msgs$.subscribe((msg) => {
      this.toasts = [...this.toasts, msg];
      this.cdr.markForCheck();
      timer(2500).subscribe(() => {
        this.toasts = this.toasts.slice(1);
        this.cdr.markForCheck();
      });
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
