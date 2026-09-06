import { Component } from '@angular/core';

import { BranchMcdComponent } from '../branch-mcd/branch-mcd.component';
import { BranchReuploadInboxComponent } from './branch-reupload-inbox.component';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-branch-monthly-compliance-page',
  imports: [BranchMcdComponent, BranchReuploadInboxComponent, PageHeaderComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
      <ui-page-header
        title="Monthly Compliance"
        subtitle="Due uploads and documents returned for reupload">
      </ui-page-header>
      <div class="flex gap-1 border-b border-gray-200 mb-4">
        <button
          type="button"
          (click)="activeTab = 'uploads'"
          [class]="activeTab === 'uploads'
            ? 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 -mb-px'
            : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
          Monthly Uploads
        </button>
        <button
          type="button"
          (click)="activeTab = 'reupload'"
          [class]="activeTab === 'reupload'
            ? 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 -mb-px'
            : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
          Returned for Reupload
        </button>
      </div>
    </div>
    @if (activeTab === 'uploads') {
      <app-branch-mcd [embedMode]="true"></app-branch-mcd>
    }
    @if (activeTab === 'reupload') {
      <app-branch-reupload-inbox [embedMode]="true"></app-branch-reupload-inbox>
    }
  `,
})
export class BranchMonthlyCompliancePageComponent {
  activeTab: 'uploads' | 'reupload' = 'uploads';
}
