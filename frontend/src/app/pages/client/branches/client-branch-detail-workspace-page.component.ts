import { Component } from '@angular/core';
import { BranchDetailComponent } from './branch-detail.component';

@Component({
  standalone: true,
  selector: 'app-client-branch-detail-workspace-page',
  imports: [BranchDetailComponent],
  template: `<app-branch-detail></app-branch-detail>`,
})
export class ClientBranchDetailWorkspacePageComponent {}
