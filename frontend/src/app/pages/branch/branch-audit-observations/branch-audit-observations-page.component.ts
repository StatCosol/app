import { Component } from '@angular/core';
import { BranchAuditObservationsComponent } from './branch-audit-observations.component';

@Component({
  standalone: true,
  selector: 'app-branch-audit-observations-page',
  imports: [BranchAuditObservationsComponent],
  template: `<app-branch-audit-observations></app-branch-audit-observations>`,
})
export class BranchAuditObservationsPageComponent {}
