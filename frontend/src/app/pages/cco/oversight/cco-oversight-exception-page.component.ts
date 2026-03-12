import { Component } from '@angular/core';
import { CcoOversightComponent } from '../cco-oversight.component';

@Component({
  standalone: true,
  selector: 'app-cco-oversight-exception-page',
  imports: [CcoOversightComponent],
  template: `<app-cco-oversight></app-cco-oversight>`,
})
export class CcoOversightExceptionPageComponent {}

