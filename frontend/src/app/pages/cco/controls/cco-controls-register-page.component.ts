import { Component } from '@angular/core';
import { CcoControlsComponent } from './cco-controls.component';

@Component({
  standalone: true,
  selector: 'app-cco-controls-register-page',
  imports: [CcoControlsComponent],
  template: `<app-cco-controls></app-cco-controls>`,
})
export class CcoControlsRegisterPageComponent {}
