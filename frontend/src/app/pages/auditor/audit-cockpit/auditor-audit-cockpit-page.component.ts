import { Component } from '@angular/core';
import { AuditorAuditWorkspaceComponent } from '../auditor-audit-workspace.component';

@Component({
  standalone: true,
  selector: 'app-auditor-audit-cockpit-page',
  imports: [AuditorAuditWorkspaceComponent],
  template: `<app-auditor-audit-workspace></app-auditor-audit-workspace>`,
})
export class AuditorAuditCockpitPageComponent {}

