import { Injectable } from '@angular/core';
import { ToastService } from '../shared/toast/toast.service';

@Injectable({ providedIn: 'root' })
export class SimpleToastService {
  constructor(private toast: ToastService) {}

  show(message: string) {
    this.toast.info(message);
  }
}
