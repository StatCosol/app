import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';

const API = environment.apiBaseUrl;

interface ReuploadRequest {
  id: string;
  documentId: number;
  documentType: string;
  targetRole: string;
  reason: string;
  remarksVisible: string;
  status: string;
  deadlineDate?: string;
  createdAt: string;
}

@Component({
  standalone: true,
  selector: 'app-contractor-reupload-requests',
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ui-page-header
        title="Reupload Requests"
        description="Review and respond to document reupload requests from auditors"
        icon="refresh"
      ></ui-page-header>

      <!-- Status Filters -->
      <div class="card p-4">
        <div class="flex flex-wrap gap-3 items-center">
          <button
            *ngFor="let st of statusTabs"
            class="px-4 py-2 rounded-lg font-medium transition"
            [class.bg-blue-600]="activeStatus === st.value"
            [class.text-white]="activeStatus === st.value"
            [class.bg-gray-100]="activeStatus !== st.value"
            [class.text-gray-700]="activeStatus !== st.value"
            (click)="activeStatus = st.value; loadRequests()"
          >
            {{ st.label }}
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="py-8">
        <ui-loading-spinner text="Loading requests..." size="md"></ui-loading-spinner>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && requests.length === 0" class="py-8">
        <ui-empty-state
          title="No reupload requests"
          [description]="activeStatus ? 'No ' + activeStatus.toLowerCase() + ' requests found.' : 'No reupload requests at this time.'"
        ></ui-empty-state>
      </div>

      <!-- Requests List -->
      <div *ngIf="!loading && requests.length > 0" class="space-y-4">
        <div *ngFor="let req of requests" class="card p-6">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span class="text-lg font-semibold text-gray-900">Request #{{ req.id.substring(0, 8) }}</span>
                <ui-status-badge [status]="req.status"></ui-status-badge>
              </div>
              <div class="text-sm text-gray-600">Created: {{ formatDate(req.createdAt) }}</div>
              <div *ngIf="req.deadlineDate" class="text-sm text-amber-700 font-medium mt-1">
                Deadline: {{ formatDate(req.deadlineDate) }}
              </div>
            </div>
          </div>

          <div class="space-y-3 mb-4">
            <div>
              <span class="text-sm font-semibold text-gray-700">Reason:</span>
              <p class="text-sm text-gray-900 mt-1">{{ req.reason }}</p>
            </div>
            <div>
              <span class="text-sm font-semibold text-gray-700">Auditor Remarks:</span>
              <p class="text-sm text-gray-900 mt-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {{ req.remarksVisible }}
              </p>
            </div>
          </div>

          <!-- Actions for OPEN requests -->
          <div *ngIf="req.status === 'OPEN'" class="border-t border-gray-200 pt-4">
            <div class="flex flex-col sm:flex-row gap-3">
              <input 
                type="file" 
                class="hidden" 
                #fileInput 
                accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                (change)="onFileSelected(req, $event)"
              />
              <button
                class="btn-primary"
                [disabled]="uploading[req.id]"
                (click)="fileInput.click()"
              >
                {{ uploading[req.id] ? 'Uploading...' : selectedFiles[req.id] ? 'Change File' : 'Upload Corrected File' }}
              </button>
              <button
                *ngIf="selectedFiles[req.id]"
                class="btn-success"
                [disabled]="submitting[req.id]"
                (click)="submitReupload(req)"
              >
                {{ submitting[req.id] ? 'Submitting...' : 'Submit for Review' }}
              </button>
            </div>
            <div *ngIf="selectedFiles[req.id]" class="mt-2 text-sm text-green-700">
              ✓ File selected: {{ selectedFiles[req.id] }}
            </div>
          </div>

          <!-- Status info for non-OPEN requests -->
          <div *ngIf="req.status !== 'OPEN'" class="border-t border-gray-200 pt-4 text-sm text-gray-600">
            <span *ngIf="req.status === 'SUBMITTED'">✓ Submitted - Awaiting CRM review</span>
            <span *ngIf="req.status === 'REVERIFIED'">✓ Verified by CRM</span>
            <span *ngIf="req.status === 'REJECTED'">✗ Rejected by CRM - Check remarks</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-input {
      @apply px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
    }
    .btn-primary {
      @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed;
    }
    .btn-success {
      @apply px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed;
    }
  `]
})
export class ContractorReuploadRequestsComponent implements OnInit {
  loading = false;
  requests: ReuploadRequest[] = [];
  activeStatus = '';
  uploading: Record<string, boolean> = {};
  submitting: Record<string, boolean> = {};
  selectedFiles: Record<string, string> = {};

  statusTabs = [
    { label: 'All', value: '' },
    { label: 'Open', value: 'OPEN' },
    { label: 'Submitted', value: 'SUBMITTED' },
    { label: 'Reverified', value: 'REVERIFIED' },
  ];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadRequests();
  }

  loadRequests() {
    this.loading = true;
    const params: any = {};
    if (this.activeStatus) {
      params.status = this.activeStatus;
    }

    this.http.get<{ data: ReuploadRequest[] }>(`${API}/contractor/compliance/reupload-requests`, { params }).subscribe({
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

  onFileSelected(req: ReuploadRequest, event: any) {
    const file: File | null = event.target?.files?.[0] || null;
    if (!file) return;

    this.uploading[req.id] = true;
    const formData = new FormData();
    formData.append('file', file);

    this.http.post<any>(`${API}/contractor/compliance/reupload-requests/${req.id}/upload`, formData).subscribe({
      next: () => {
        this.uploading[req.id] = false;
        this.selectedFiles[req.id] = file.name;
        event.target.value = '';
      },
      error: (err) => {
        this.uploading[req.id] = false;
        alert('Upload failed: ' + (err.error?.message || 'Unknown error'));
        event.target.value = '';
      }
    });
  }

  submitReupload(req: ReuploadRequest) {
    if (!this.selectedFiles[req.id]) {
      alert('Please upload a file first');
      return;
    }

    this.submitting[req.id] = true;
    this.http.post<any>(`${API}/contractor/compliance/reupload-requests/${req.id}/submit`, {}).subscribe({
      next: () => {
        this.submitting[req.id] = false;
        delete this.selectedFiles[req.id];
        alert('Reupload submitted successfully for CRM review');
        this.loadRequests();
      },
      error: (err) => {
        this.submitting[req.id] = false;
        alert('Submit failed: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  formatDate(date: string | null): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
