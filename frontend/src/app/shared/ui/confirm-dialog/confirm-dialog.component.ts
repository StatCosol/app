import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConfirmDialogService,
  DialogConfig,
  DialogResult,
  DialogRequest,
} from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="open" class="fixed inset-0 z-[9999] flex items-center justify-center">
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" (click)="cancel()"></div>

      <!-- Dialog -->
      <div
        class="relative z-10 w-full max-w-md mx-4 bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        <!-- Header -->
        <div class="px-6 pt-5 pb-2">
          <h3 class="text-lg font-semibold text-gray-900">{{ config.title }}</h3>
        </div>

        <!-- Body -->
        <div class="px-6 pb-4">
          <p class="text-sm text-gray-600 whitespace-pre-line">{{ config.message }}</p>

          <div *ngIf="config.type === 'prompt'" class="mt-3">
            <textarea
              #promptInput
              [(ngModel)]="inputValue"
              [placeholder]="config.placeholder || ''"
              rows="3"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              (keydown.enter)="$any($event).ctrlKey && ok()">
            </textarea>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            (click)="cancel()">
            {{ config.cancelText || 'Cancel' }}
          </button>
          <button
            type="button"
            [ngClass]="{
              'bg-red-600 hover:bg-red-700 focus:ring-red-500': config.variant === 'danger',
              'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500': config.variant !== 'danger'
            }"
            class="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
            (click)="ok()">
            {{ config.confirmText || 'OK' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  open = false;
  inputValue = '';
  config: DialogConfig = { title: '', message: '', type: 'confirm' };
  private resolveFn: ((r: DialogResult) => void) | null = null;

  constructor(
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.dialog.requests$
      .pipe(takeUntil(this.destroy$))
      .subscribe((req: DialogRequest) => {
        this.config = req.config;
        this.resolveFn = req.resolve;
        this.inputValue = req.config.defaultValue || '';
        this.open = true;
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.cancel();
  }

  ok(): void {
    this.open = false;
    this.resolveFn?.({
      confirmed: true,
      value: this.config.type === 'prompt' ? this.inputValue : undefined,
    });
    this.resolveFn = null;
    this.cdr.detectChanges();
  }

  cancel(): void {
    this.open = false;
    this.resolveFn?.({ confirmed: false });
    this.resolveFn = null;
    this.cdr.detectChanges();
  }
}
