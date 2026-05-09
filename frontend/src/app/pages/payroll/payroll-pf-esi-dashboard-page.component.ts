import { Component , ChangeDetectionStrategy} from '@angular/core';
import { PayrollPfEsiComponent } from './payroll-pf-esi.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-payroll-pf-esi-dashboard-page',
  imports: [PayrollPfEsiComponent],
  template: `<app-payroll-pf-esi></app-payroll-pf-esi>`,
})
export class PayrollPfEsiDashboardPageComponent {}
