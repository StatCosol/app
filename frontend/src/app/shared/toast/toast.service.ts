import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ToastMessage, ToastType } from './toast.model';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly _toasts = new BehaviorSubject<ToastMessage[]>([]);
  readonly toasts$ = this._toasts.asObservable();

  success(title: string, message = '', duration = 3000): void {
    this.show('success', title, message, duration);
  }

  error(title: string, message = '', duration = 5000): void {
    this.show('error', title, message, duration);
  }

  warning(title: string, message = '', duration = 4000): void {
    this.show('warning', title, message, duration);
  }

  info(title: string, message = '', duration = 3000): void {
    this.show('info', title, message, duration);
  }

  remove(id: string): void {
    const current = this._toasts.value.filter((t) => t.id !== id);
    this._toasts.next(current);
  }

  clear(): void {
    this._toasts.next([]);
  }

  private show(
    type: ToastType,
    title: string,
    message: string,
    duration: number,
  ): void {
    const toast: ToastMessage = {
      id: this.generateId(),
      type,
      title,
      message,
      duration,
    };

    this._toasts.next([...this._toasts.value, toast]);

    window.setTimeout(() => {
      this.remove(toast.id);
    }, duration);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
