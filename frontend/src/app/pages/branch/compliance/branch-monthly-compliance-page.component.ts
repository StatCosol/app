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
          (click)="selectTab('uploads')"
          [class]="activeTab === 'uploads'
            ? 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 -mb-px'
            : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
          Monthly Uploads
        </button>
        <button
          type="button"
          (click)="selectTab('reupload')"
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
    <!-- Mounted on first visit, then kept alive and merely hidden.
         @if alone would destroy this on every tab switch, discarding a chosen
         file — which cannot be restored programmatically — along with a typed
         note, filters, and any open not-applicable form. Plain [hidden] alone
         would mount it on page load and fetch for a tab nobody opened. The
         visited flag takes both: nothing loads until the tab is chosen, and
         nothing is lost after that. -->
    @if (reuploadVisited) {
      <app-branch-reupload-inbox
        [embedMode]="true"
        [hidden]="activeTab !== 'reupload'"></app-branch-reupload-inbox>
    }
  `,
})
export class BranchMonthlyCompliancePageComponent {
  activeTab: 'uploads' | 'reupload' = 'uploads';
  /** Set once the reupload tab is opened; never cleared, so the tab keeps its state. */
  reuploadVisited = false;

  selectTab(tab: 'uploads' | 'reupload'): void {
    this.activeTab = tab;
    if (tab === 'reupload') this.reuploadVisited = true;
  }
}
