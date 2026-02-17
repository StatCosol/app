import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditorAuditService, AuditorDocRow, ReuploadRequest } from '../../core/auditor-audit.service';
import { PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-auditor-audit-workspace',
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ui-page-header
        title="Audit Workspace"
        description="Review documents and request re-uploads"
        icon="clipboard-check"
      ></ui-page-header>

      <div class="card">
        <div class="flex items-center border-b border-gray-200">
          <button
            class="px-6 py-3 font-semibold border-b-2 transition"
            [class.border-blue-600]="activeTab === 'docs'"
            [class.text-blue-600]="activeTab === 'docs'"
            [class.border-transparent]="activeTab !== 'docs'"
            [class.text-gray-600]="activeTab !== 'docs'"
            (click)="activeTab = 'docs'; loadDocs()"
          >
            Documents
          </button>
          <button
            class="px-6 py-3 font-semibold border-b-2 transition"
            [class.border-blue-600]="activeTab === 'requests'"
            [class.text-blue-600]="activeTab === 'requests'"
            [class.border-transparent]="activeTab !== 'requests'"
            [class.text-gray-600]="activeTab !== 'requests'"
            (click)="activeTab = 'requests'; loadRequests()"
          >
            Reupload Requests
          </button>
        </div>

        <!-- Filters -->
        <div class="p-4 bg-gray-50 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search..."
            class="form-input w-48"
            [(ngModel)]="filters.search"
          />
          <select class="form-select" [(ngModel)]="filters.clientId" (change)="loadData()">
            <option value="">All Clients</option>
            <!-- Add client options from API -->
          </select>
          <button class="btn-primary" (click)="loadData()">Apply Filters</button>
        </div>

        <!-- Documents Tab -->
        <div *ngIf="activeTab === 'docs'" class="p-4">
          <div *ngIf="loading" class="py-8">
            <ui-loading-spinner text="Loading documents..." size="md"></ui-loading-spinner>
          </div>

          <div *ngIf="!loading && docs.length === 0" class="py-8">
            <ui-empty-state
              title="No documents found"
              description="No documents match your filters."
            ></ui-empty-state>
          </div>

          <div *ngIf="!loading && docs.length > 0" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">File Name</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Compliance</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Unit</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Uploaded</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 bg-white">
                <tr *ngFor="let doc of docs" class="hover:bg-gray-50">
                  <td class="px-4 py-3">
                    <div class="text-sm font-medium text-gray-900">{{ doc.fileName }}</div>
                    <div class="text-xs text-gray-500">{{ formatFileSize(doc.fileSize) }}</div>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-800">
                    {{ doc.task?.compliance?.title || '-' }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-800">
                    {{ doc.task?.branch?.branchName || '-' }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600">
                    {{ formatDate(doc.createdAt) }}
                  </td>
                  <td class="px-4 py-3 text-right space-x-2">
                    <button class="btn-secondary text-xs" (click)="openRemarkModal(doc)">
                      Add Remark
                    </button>
                    <button class="btn-primary text-xs" (click)="openReuploadModal(doc)">
                      Request Reupload
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Reupload Requests Tab -->
        <div *ngIf="activeTab === 'requests'" class="p-4">
          <div *ngIf="loading" class="py-8">
            <ui-loading-spinner text="Loading requests..." size="md"></ui-loading-spinner>
          </div>

          <div *ngIf="!loading && requests.length === 0" class="py-8">
            <ui-empty-state
              title="No reupload requests"
              description="No reupload requests found."
            ></ui-empty-state>
          </div>

          <div *ngIf="!loading && requests.length > 0" class="space-y-3">
            <div *ngFor="let req of requests" class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm font-semibold text-gray-900">Request #{{ req.id.substring(0, 8) }}</span>
                    <ui-status-badge [status]="req.status"></ui-status-badge>
                  </div>
                  <div class="text-sm text-gray-700 mb-1"><strong>Reason:</strong> {{ req.reason }}</div>
                  <div class="text-sm text-gray-700 mb-1"><strong>Remarks:</strong> {{ req.remarksVisible }}</div>
                  <div class="text-xs text-gray-500">Target: {{ req.targetRole }} | Created: {{ formatDate(req.createdAt) }}</div>
                  <div *ngIf="req.deadlineDate" class="text-xs text-amber-700 mt-1">
                    Deadline: {{ formatDate(req.deadlineDate) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Remark Modal -->
    <div *ngIf="remarkModalOpen" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" (click)="remarkModalOpen = false">
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900">Add Remark</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Remark Text</label>
            <textarea
              class="form-input w-full"
              rows="4"
              [(ngModel)]="remarkForm.text"
              placeholder="Enter your remark..."
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
            <select class="form-select w-full" [(ngModel)]="remarkForm.visibility">
              <option value="CONTRACTOR_VISIBLE">Visible to Contractor</option>
              <option value="CLIENT_VISIBLE">Visible to Client</option>
              <option value="INTERNAL">Internal Only</option>
            </select>
          </div>
        </div>
        <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
          <button class="btn-secondary" (click)="remarkModalOpen = false">Cancel</button>
          <button class="btn-primary" (click)="submitRemark()" [disabled]="submitting || !remarkForm.text">
            {{ submitting ? 'Submitting...' : 'Submit' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reupload Request Modal -->
    <div *ngIf="reuploadModalOpen" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" (click)="reuploadModalOpen = false">
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900">Request Re-upload</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <select class="form-select w-full" [(ngModel)]="reuploadForm.reason">
              <option value="">Select reason...</option>
              <option value="Document unclear">Document unclear</option>
              <option value="Missing information">Missing information</option>
              <option value="Incorrect format">Incorrect format</option>
              <option value="Non-compliant">Non-compliant</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Detailed Remarks</label>
            <textarea
              class="form-input w-full"
              rows="4"
              [(ngModel)]="reuploadForm.remarks"
              placeholder="Provide detailed remarks..."
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Deadline (Optional)</label>
            <input type="date" class="form-input w-full" [(ngModel)]="reuploadForm.deadlineDate" />
          </div>
        </div>
        <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
          <button class="btn-secondary" (click)="reuploadModalOpen = false">Cancel</button>
          <button class="btn-primary" (click)="submitReuploadRequest()" [disabled]="submitting || !reuploadForm.reason || !reuploadForm.remarks">
            {{ submitting ? 'Submitting...' : 'Request Re-upload' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-input, .form-select {
      @apply px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
    }
    .btn-primary {
      @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed;
    }
    .btn-secondary {
      @apply px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300;
    }
  `]
})
export class AuditorAuditWorkspaceComponent implements OnInit {
  activeTab: 'docs' | 'requests' = 'docs';
  loading = false;
  submitting = false;
  docs: AuditorDocRow[] = [];
  requests: ReuploadRequest[] = [];
  filters: any = { search: '', clientId: '' };

  remarkModalOpen = false;
  reuploadModalOpen = false;
  selectedDoc: AuditorDocRow | null = null;
  remarkForm: any = { text: '', visibility: 'CONTRACTOR_VISIBLE' };
  reuploadForm: any = { reason: '', remarks: '', deadlineDate: '' };

  constructor(private auditService: AuditorAuditService) {}

  ngOnInit() {
    this.loadDocs();
  }

  loadData() {
    if (this.activeTab === 'docs') {
      this.loadDocs();
    } else {
      this.loadRequests();
    }
  }

  loadDocs() {
    this.loading = true;
    this.auditService.listDocs(this.filters).subscribe({
      next: (res: any) => {
        this.docs = res.data || [];
        this.loading = false;
      },
      error: () => {
        this.docs = [];
        this.loading = false;
      }
    });
  }

  loadRequests() {
    this.loading = true;
    this.auditService.listReuploadRequests(this.filters).subscribe({
      next: (res: any) => {
        this.requests = res.data || [];
        this.loading = false;
      },
      error: () => {
        this.requests = [];
        this.loading = false;
      }
    });
  }

  openRemarkModal(doc: AuditorDocRow) {
    this.selectedDoc = doc;
    this.remarkForm = { text: '', visibility: 'CONTRACTOR_VISIBLE' };
    this.remarkModalOpen = true;
  }

  openReuploadModal(doc: AuditorDocRow) {
    this.selectedDoc = doc;
    this.reuploadForm = { reason: '', remarks: '', deadlineDate: '' };
    this.reuploadModalOpen = true;
  }

  submitRemark() {
    if (!this.selectedDoc || !this.remarkForm.text) return;
    this.submitting = true;
    this.auditService.addRemark(this.selectedDoc.id, this.remarkForm).subscribe({
      next: () => {
        this.submitting = false;
        this.remarkModalOpen = false;
        alert('Remark added successfully');
      },
      error: () => {
        this.submitting = false;
        alert('Failed to add remark');
      }
    });
  }

  submitReuploadRequest() {
    if (!this.selectedDoc || !this.reuploadForm.reason || !this.reuploadForm.remarks) return;
    this.submitting = true;
    this.auditService.requestReupload(this.selectedDoc.id, this.reuploadForm).subscribe({
      next: () => {
        this.submitting = false;
        this.reuploadModalOpen = false;
        alert('Reupload request submitted successfully');
        this.loadData();
      },
      error: () => {
        this.submitting = false;
        alert('Failed to submit reupload request');
      }
    });
  }

  formatDate(date: string | null): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}
