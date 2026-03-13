import { Component } from '@angular/core';
import { PayrollStructuresComponent } from './payroll-structures.component';

@Component({
  standalone: true,
  selector: 'app-payroll-structures-builder-page',
  imports: [PayrollStructuresComponent],
  template: `<app-payroll-structures></app-payroll-structures>`,
})
export class PayrollStructuresBuilderPageComponent {}
