import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-documents',
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <ui-page-header title="Documents" description="Client documents by level"></ui-page-header>

    <ui-loading-spinner *ngIf="loading" text="Loading documents..."></ui-loading-spinner>

    <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

    <ui-empty-state
      *ngIf="!loading && !error && documents.length === 0"
      title="No documents"
      description="Client documents will appear here once available."
      icon="document">
    </ui-empty-state>

    <div *ngIf="!loading && documents.length > 0" class="space-y-3">
      <div *ngFor="let doc of documents" class="card flex items-center justify-between">
        <div>
          <p class="font-medium">{{ doc.name || doc.fileName }}</p>
          <p class="text-sm text-gray-500">{{ doc.type || 'Document' }} &middot; {{ doc.createdAt | date:'mediumDate' }}</p>
        </div>
        <a *ngIf="doc.downloadUrl" [href]="doc.downloadUrl" target="_blank" class="btn-primary-sm">Download</a>
      </div>
    </div>
  `,
})
export class CrmDocumentsComponent implements OnInit {
  documents: any[] = [];
  loading = false;
  error: string | null = null;

  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.http.get<any[]>(`${this.baseUrl}/api/crm/contractor-documents`).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.documents = data || []; this.cdr.detectChanges(); },
      error: () => { this.documents = []; this.cdr.detectChanges(); },
    });
  }
}
