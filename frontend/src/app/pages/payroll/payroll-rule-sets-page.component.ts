import { Component } from '@angular/core';
import { PayrollRuleSetsComponent } from './payroll-rule-sets.component';

@Component({
  standalone: true,
  selector: 'app-payroll-rule-sets-page',
  imports: [PayrollRuleSetsComponent],
  template: `<app-payroll-rule-sets></app-payroll-rule-sets>`,
})
export class PayrollRuleSetsPageComponent {}
