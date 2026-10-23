import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BranchComplianceDocService, ComplianceDoc } from '../../core/branch-compliance-doc.service';
import { ProtectedFileService } from '../files/services/protected-file.service';
import { ToastService } from '../toast/toast.service';
import { AuditFilePreviewComponent, AuditFilePreview } from '../files/components/audit-file-preview.component';

@Component({
  selector: 'app-compliance-document-records', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AuditFilePreviewComponent],
  template: `
    <section class="bg-white border rounded-xl p-4 mb-6">
      <h2 class="font-semibold text-lg">Compliance submissions</h2>
      <p class="text-sm text-gray-600 mb-3">Returns and challans uploaded by branch and CRM users.</p>
      @if (!branch) {
      <div class="flex flex-wrap gap-3 mb-4 aligned-filter-controls">
        <input type="number" min="2020" max="2050" placeholder="All years" aria-label="Submission year" [(ngModel)]="year" (ngModelChange)="resetPage()" class="border rounded p-2 w-28">
        <select aria-label="Submission frequency" [(ngModel)]="frequency" (ngModelChange)="resetPage()" class="border rounded p-2">
          <option value="">All frequencies</option><option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="YEARLY">Yearly</option>
        </select>
        @if (crm && companyId) {
          <a class="border rounded p-2" [routerLink]="['/crm/clients', companyId, 'compliance-tracker']">Upload compliance return</a>
        }
        <button type="button" class="border rounded p-2" (click)="load()">Refresh</button>
      </div>
      }
      <label class="block mb-3 text-sm">Records
        <select aria-label="Submission records" [(ngModel)]="recordScope" (ngModelChange)="resetPage()" class="border rounded p-2 ml-2">
          <option value="ACTUAL">Actual records</option><option value="TEST">Test records only</option>
        </select>
      </label>
      @if (recordScope === 'TEST') { <p role="status" class="mb-3 text-amber-800">TEST DATA ONLY - excluded from the actual-records view.</p> }
      @if (loading) { <p>Loading submissions…</p> }
      @if (error) { <p class="text-red-700">{{ error }}</p> }
      @if (!loading && !error) {
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="text-left border-b">@if (!branch) { <th class="p-2">Branch</th> }<th class="p-2">Return</th><th class="p-2">Period</th><th class="p-2">Status</th><th class="p-2">File</th></tr></thead>
          <tbody>
          @for (doc of documents; track doc.id) {
            <tr class="border-b">@if (!branch) { <td class="p-2">{{ doc.branch?.branchName || doc.branchId || 'Company' }}</td> }<td class="p-2">{{ doc.returnName }} @if(recordScope === 'TEST'){<strong class="block text-amber-800">TEST ONLY</strong>}</td><td class="p-2">{{ period(doc) }}</td><td class="p-2">{{ doc.status }}</td>
              <td class="p-2">@if (doc.uploadedFileUrl) {
                <button type="button" class="border rounded p-1 mr-2" (click)="open(doc)">View</button>
                <button type="button" class="border rounded p-1" (click)="open(doc, true)">Download</button>
              }</td></tr>
          } @empty { <tr><td [attr.colspan]="branch ? 4 : 5" class="p-3">No submissions for this period.</td></tr> }
          </tbody>
        </table></div>
        @if (total > 50) {
          <div class="flex gap-3 mt-3"><button type="button" [disabled]="page === 1" (click)="page = page - 1; load()">Previous</button>
            <span>Page {{ page }}</span><button type="button" [disabled]="page * 50 >= total" (click)="page = page + 1; load()">Next</button></div>
        }
      }
    </section>
    @if (documentPreview) { <app-audit-file-preview [request]="documentPreview" (closed)="documentPreview = null" /> }
  `,
})
export class ComplianceDocumentRecordsComponent implements OnChanges, OnDestroy {
  documentPreview: AuditFilePreview | null = null;
  @Input() crm = false;
  @Input() branch = false;
  @Input() branchId = '';
  @Input() companyId = '';
  @Input() revision = 0;
  @Input() year: number | null = new Date().getFullYear();
  @Input() frequency = '';
  @Input() month?: number;
  @Input() quarter?: number;
  @Input() half?: number;
  recordScope: 'ACTUAL' | 'TEST' = 'ACTUAL';
  page = 1; total = 0;
  documents: ComplianceDoc[] = []; loading = false; error = '';
  private request?: Subscription;
  private destroy$ = new Subject<void>();
  constructor(private api: BranchComplianceDocService, private files: ProtectedFileService, private toast: ToastService, private cdr: ChangeDetectorRef) {}
  ngOnChanges() { this.resetPage(); }
  ngOnDestroy() { this.request?.unsubscribe(); this.destroy$.next(); this.destroy$.complete(); }
  resetPage() { this.page = 1; this.load(); }
  load() {
    this.request?.unsubscribe();
    if ((this.crm && !this.companyId) || (this.branch && !this.branchId)) { this.documents = []; this.loading = false; return; }
    this.loading = true; this.error = ''; this.documents = [];
    const filters = { recordScope: this.recordScope, branchId: this.branch ? this.branchId : undefined, year: this.year || undefined, month: this.branch && this.frequency === 'MONTHLY' ? this.month : undefined, quarter: this.branch && this.frequency === 'QUARTERLY' ? this.quarter : undefined, half: this.branch && this.frequency === 'HALF_YEARLY' ? this.half : undefined, frequency: this.frequency || undefined, companyId: this.crm ? this.companyId : undefined, page: this.page, pageSize: 50 };
    const request = this.branch ? this.api.listBranchDocs(filters) : this.crm ? this.api.listCrmDocs(filters) : this.api.listClientDocs(filters);
    this.request = request.pipe(takeUntil(this.destroy$)).subscribe({
      next: result => { this.documents = result.data; this.total = result.total; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'Unable to load compliance submissions.'; this.cdr.markForCheck(); },
    });
  }
  period(doc: ComplianceDoc) {
    if (doc.frequency === 'MONTHLY') return doc.periodYear + '-' + String(doc.periodMonth).padStart(2, '0');
    if (doc.frequency === 'QUARTERLY') return doc.periodYear + ' Q' + doc.periodQuarter;
    if (doc.frequency === 'HALF_YEARLY') return doc.periodYear + ' H' + doc.periodHalf;
    return String(doc.periodYear);
  }
  open(doc: ComplianceDoc, download = false) {
    if (!doc.uploadedFileUrl) return;
    if (!download) {
      this.documentPreview = {url: doc.uploadedFileUrl, name: doc.uploadedFileName || 'Compliance document'};
      return;
    }
    const request = this.files.download(doc.uploadedFileUrl, doc.uploadedFileName);
    request.pipe(takeUntil(this.destroy$)).subscribe({ error: () => this.toast.error('Unable to open document.') });
  }
}
