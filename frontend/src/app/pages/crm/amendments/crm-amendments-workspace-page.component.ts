import { Component } from '@angular/core';
import { CrmAmendmentsComponent } from './crm-amendments.component';

@Component({
  standalone: true,
  selector: 'app-crm-amendments-workspace-page',
  imports: [CrmAmendmentsComponent],
  template: `<app-crm-amendments></app-crm-amendments>`,
})
export class CrmAmendmentsWorkspacePageComponent {}
