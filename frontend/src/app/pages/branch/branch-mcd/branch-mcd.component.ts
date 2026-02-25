import { Component } from '@angular/core';
import { ClientMcdUploadsComponent } from '../../client/compliance/client-mcd-uploads.component';

@Component({
  selector: 'app-branch-mcd',
  standalone: true,
  imports: [ClientMcdUploadsComponent],
  template: `
    <div class="page-container">
      <div class="page-header-bar">
        <h1 class="page-title">Monthly Compliance Documents</h1>
        <p class="page-subtitle">Upload and track monthly compliance submissions (Challans, Returns, Registers)</p>
      </div>
      <app-client-mcd-uploads></app-client-mcd-uploads>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header-bar { margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
  `]
})
export class BranchMcdComponent {}
