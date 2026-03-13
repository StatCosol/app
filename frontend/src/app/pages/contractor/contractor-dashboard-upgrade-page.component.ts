import { Component } from '@angular/core';
import { ContractorDashboardComponent } from './contractor-dashboard.component';

@Component({
  standalone: true,
  selector: 'app-contractor-dashboard-upgrade-page',
  imports: [ContractorDashboardComponent],
  template: `<app-contractor-dashboard></app-contractor-dashboard>`,
})
export class ContractorDashboardUpgradePageComponent {}
