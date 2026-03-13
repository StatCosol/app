import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface DialogConfig {
  title: string;
  message: string;
  /** 'confirm' = OK/Cancel, 'prompt' = text input + OK/Cancel */
  type: 'confirm' | 'prompt';
  confirmText?: string;
  cancelText?: string;
  /** For prompt: placeholder text */
  placeholder?: string;
  /** For prompt: pre-filled value */
  defaultValue?: string;
  /** 'danger' makes the confirm button red */
  variant?: 'default' | 'danger';
}

export interface DialogResult {
  confirmed: boolean;
  /** For prompt dialogs: the text the user entered */
  value?: string;
}

/** @internal */
export interface DialogRequest {
  config: DialogConfig;
  resolve: (result: DialogResult) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  /** Stream consumed by ConfirmDialogComponent */
  readonly requests$ = new Subject<DialogRequest>();

  /**
   * Show a confirmation dialog.
   *
   * Usage:
   * ```ts
   * const ok = await this.dialog.confirm('Delete item?', 'This cannot be undone.');
   * if (!ok) return;
   * ```
   */
  confirm(
    title: string,
    message: string,
    opts?: { confirmText?: string; cancelText?: string; variant?: 'default' | 'danger' },
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.requests$.next({
        config: { title, message, type: 'confirm', ...opts },
        resolve: (r) => resolve(r.confirmed),
      });
    });
  }

  /**
   * Show a prompt dialog with a text input.
   *
   * Usage:
   * ```ts
   * const result = await this.dialog.prompt('Rejection reason', 'Enter reason:', { placeholder: 'Required...' });
   * if (!result.confirmed) return;
   * const reason = result.value;
   * ```
   */
  prompt(
    title: string,
    message: string,
    opts?: { placeholder?: string; defaultValue?: string; confirmText?: string; cancelText?: string },
  ): Promise<DialogResult> {
    return new Promise<DialogResult>((resolve) => {
      this.requests$.next({
        config: { title, message, type: 'prompt', ...opts },
        resolve,
      });
    });
  }
}
