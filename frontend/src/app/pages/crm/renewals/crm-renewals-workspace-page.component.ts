import { Component } from '@angular/core';
import { CrmRenewalsComponent } from './crm-renewals.component';

@Component({
  standalone: true,
  selector: 'app-crm-renewals-workspace-page',
  imports: [CrmRenewalsComponent],
  template: `<app-crm-renewals></app-crm-renewals>`,
})
export class CrmRenewalsWorkspacePageComponent {}
