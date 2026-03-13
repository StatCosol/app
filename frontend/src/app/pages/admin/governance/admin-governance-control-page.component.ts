import { Component } from '@angular/core';
import { AdminGovernanceControlComponent } from './admin-governance-control.component';

@Component({
  standalone: true,
  selector: 'app-admin-governance-control-page',
  imports: [AdminGovernanceControlComponent],
  template: `<app-admin-governance-control></app-admin-governance-control>`,
})
export class AdminGovernanceControlPageComponent {}
