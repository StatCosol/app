import { Component } from '@angular/core';
import { CeoReportsComponent } from './ceo-reports.component';

@Component({
  standalone: true,
  selector: 'app-ceo-executive-reports-page',
  imports: [CeoReportsComponent],
  template: `<app-ceo-reports></app-ceo-reports>`,
})
export class CeoExecutiveReportsPageComponent {}
