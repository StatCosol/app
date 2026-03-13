import { Component } from '@angular/core';
import { CrmReturnsFilingsComponent } from './crm-returns-filings.component';

@Component({
  standalone: true,
  selector: 'app-crm-returns-workspace-page',
  imports: [CrmReturnsFilingsComponent],
  template: `<app-crm-returns-filings></app-crm-returns-filings>`,
})
export class CrmReturnsWorkspacePageComponent {}
