import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BranchMcdComponent } from '../branch-mcd/branch-mcd.component';
import { BranchReuploadInboxComponent } from './branch-reupload-inbox.component';

@Component({
  standalone: true,
  selector: 'app-branch-monthly-compliance-page',
  imports: [CommonModule, BranchMcdComponent, BranchReuploadInboxComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
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
    <app-branch-mcd *ngIf="activeTab === 'uploads'"></app-branch-mcd>
    <app-branch-reupload-inbox [hidden]="activeTab !== 'reupload'"></app-branch-reupload-inbox>
  `,
})
export class BranchMonthlyCompliancePageComponent {
  activeTab: 'uploads' | 'reupload' = 'uploads';
}
