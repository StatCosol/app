import { Component , ChangeDetectionStrategy} from '@angular/core';
import { CrmDashboardComponent } from './crm-dashboard.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-crm-dashboard-action-page',
  imports: [CrmDashboardComponent],
  template: `<app-crm-dashboard></app-crm-dashboard>`,
})
export class CrmDashboardActionPageComponent {}
