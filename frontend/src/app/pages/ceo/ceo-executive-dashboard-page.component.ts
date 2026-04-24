import { Component , ChangeDetectionStrategy} from '@angular/core';
import { CeoDashboardComponent } from './ceo-dashboard.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ceo-executive-dashboard-page',
  imports: [CeoDashboardComponent],
  template: `<app-ceo-dashboard></app-ceo-dashboard>`,
})
export class CeoExecutiveDashboardPageComponent {}
