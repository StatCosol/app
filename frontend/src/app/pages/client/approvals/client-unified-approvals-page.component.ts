import { Component } from '@angular/core';
import { ClientUnifiedApprovalsComponent } from './client-unified-approvals.component';

@Component({
  standalone: true,
  selector: 'app-client-unified-approvals-page',
  imports: [ClientUnifiedApprovalsComponent],
  template: `<app-client-unified-approvals></app-client-unified-approvals>`,
})
export class ClientUnifiedApprovalsPageComponent {}
