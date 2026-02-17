import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export interface ToastMsg {
  type: ToastType;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _msgs = new Subject<ToastMsg>();
  readonly msgs$ = this._msgs.asObservable();

  success(text: string): void {
    this._msgs.next({ type: 'success', text });
  }

  error(text: string): void {
    this._msgs.next({ type: 'error', text });
  }

  info(text: string): void {
    this._msgs.next({ type: 'info', text });
  }

  warning(text: string): void {
    this._msgs.next({ type: 'warning', text });
  }
}
