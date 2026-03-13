import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { BranchSafetyApiService } from '../../../core/api/branch-safety-api.service';
import {
  ExpiringDocument,
  MasterDocument,
  SafetyDocument,
  SafetyDocumentsApi,
  SafetyScore,
} from '../../../core/api/safety-documents.api';
import { ToastService } from '../../../shared/toast/toast.service';

type PeriodicityTab =
  | 'ALL'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY'
  | 'EVENT_BASED';
type RequirementStatus = 'UPLOADED' | 'MISSING' | 'EXPIRED';

interface SafetyRequiredDocPayload {
  docMasterId: number;
  documentName: string;
  category: string;
  frequency: string;
  isMandatory: boolean;
  uploaded?: boolean;
  uploadStatus?: string | null;
  uploadId?: string | null;
}

interface SafetyRequirementRow {
  docMasterId: number;
  documentName: string;
  category: string;
  frequency: PeriodicityTab;
  isMandatory: boolean;
  status: RequirementStatus;
  uploadStatus: string | null;
  uploadId: string | null;
  latestDocument: SafetyDocument | null;
  lastUploadedAt: string | null;
  daysToExpiry: number | null;
}

@Component({
  selector: 'app-branch-safety',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch-safety.component.html',
  styleUrls: ['./branch-safety.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchSafetyComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  uploading = false;
  branchId = '';

  documents: SafetyDocument[] = [];
  expiringDocs: ExpiringDocument[] = [];
  masterList: MasterDocument[] = [];
  safetyScore: SafetyScore | null = null;

  requirements: SafetyRequirementRow[] = [];
  filteredRequirements: SafetyRequirementRow[] = [];
  selectedRequirement: SafetyRequirementRow | null = null;

  activePeriodicity: PeriodicityTab = 'ALL';
  categoryFilter = 'ALL';
  statusFilter: 'ALL' | RequirementStatus = 'ALL';
  searchTerm = '';

  selectedFile: File | null = null;
  uploadRemarks = '';

  readonly periodicityTabs: Array<{ value: PeriodicityTab; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'HALF_YEARLY', label: 'Half-Yearly' },
    { value: 'YEARLY', label: 'Yearly' },
    { value: 'EVENT_BASED', label: 'Event-Based' },
  ];

  constructor(
    private readonly auth: AuthService,
    private readonly safetyApi: SafetyDocumentsApi,
    private readonly branchSafetyApi: BranchSafetyApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    this.branchId = branchIds.length ? String(branchIds[0]) : '';
    this.loadWorkspace();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalRequired(): number {
    return this.filteredRequirements.length;
  }

  get uploadedCount(): number {
    return this.filteredRequirements.filter((row) => row.status === 'UPLOADED').length;
  }

  get missingCount(): number {
    return this.filteredRequirements.filter((row) => row.status === 'MISSING').length;
  }

  get expiredCount(): number {
    return this.filteredRequirements.filter((row) => row.status === 'EXPIRED').length;
  }

  get completenessPct(): number {
    if (!this.totalRequired) return 0;
    return Math.round((this.uploadedCount / this.totalRequired) * 100);
  }

  get categories(): string[] {
    return Array.from(
      new Set(this.requirements.map((row) => row.category).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }

  get missingItems(): SafetyRequirementRow[] {
    return this.filteredRequirements
      .filter((row) => row.status === 'MISSING')
      .sort((a, b) => Number(b.isMandatory) - Number(a.isMandatory))
      .slice(0, 12);
  }

  get expiryAlerts(): ExpiringDocument[] {
    return this.expiringDocs.filter((doc) =>
      this.activePeriodicity === 'ALL'
        ? true
        : this.normalizeFrequency(doc?.category || doc?.documentType || '') === this.activePeriodicity,
    );
  }

  get incidentLogs(): SafetyDocument[] {
    return this.documents
      .filter((doc) => this.isIncidentDoc(doc))
      .filter((doc) => this.matchTabByDocument(doc))
      .sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt))
      .slice(0, 10);
  }

  get trainingLogs(): SafetyDocument[] {
    return this.documents
      .filter((doc) => this.isTrainingDoc(doc))
      .filter((doc) => this.matchTabByDocument(doc))
      .sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt))
      .slice(0, 10);
  }

  get committeeRecords(): SafetyDocument[] {
    return this.documents
      .filter((doc) => this.isCommitteeDoc(doc))
      .filter((doc) => this.matchTabByDocument(doc))
      .sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt))
      .slice(0, 10);
  }

  trackRequirement(_: number, row: SafetyRequirementRow): string {
    return `${row.docMasterId}-${row.documentName}`;
  }

  trackDocument(_: number, row: SafetyDocument): string {
    return row.id;
  }

  setPeriodicity(tab: PeriodicityTab): void {
    this.activePeriodicity = tab;
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredRequirements = this.requirements.filter((row) => {
      if (this.activePeriodicity !== 'ALL' && row.frequency !== this.activePeriodicity) return false;
      if (this.categoryFilter !== 'ALL' && row.category !== this.categoryFilter) return false;
      if (this.statusFilter !== 'ALL' && row.status !== this.statusFilter) return false;
      if (!q) return true;
      const text = `${row.documentName} ${row.category}`.toLowerCase();
      return text.includes(q);
    });

    this.hydrateSelection(this.selectedRequirement?.docMasterId || null);
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.activePeriodicity = 'ALL';
    this.categoryFilter = 'ALL';
    this.statusFilter = 'ALL';
    this.searchTerm = '';
    this.applyFilters();
  }

  selectRequirement(row: SafetyRequirementRow): void {
    this.selectedRequirement = row;
    this.selectedFile = null;
    this.uploadRemarks = '';
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  uploadForSelectedRequirement(): void {
    const req = this.selectedRequirement;
    if (!req) {
      this.toast.error('Select a safety requirement first.');
      return;
    }
    if (!this.selectedFile) {
      this.toast.error('Choose a file before upload.');
      return;
    }
    if (!this.branchId) {
      this.toast.error('Branch mapping not found for current user.');
      return;
    }

    this.uploading = true;
    const now = new Date();
    const fd = new FormData();
    fd.append('file', this.selectedFile);
    fd.append('branchId', this.branchId);
    fd.append('documentType', req.documentName);
    fd.append('documentName', req.documentName);
    fd.append('category', req.category);
    fd.append('frequency', this.backendFrequency(req.frequency));
    if (req.docMasterId) fd.append('masterDocumentId', String(req.docMasterId));
    if (this.uploadRemarks.trim()) fd.append('remarks', this.uploadRemarks.trim());

    if (req.frequency === 'MONTHLY') {
      fd.append('periodMonth', String(now.getMonth() + 1));
      fd.append('periodYear', String(now.getFullYear()));
    }
    if (req.frequency === 'QUARTERLY') {
      fd.append('periodQuarter', String(Math.floor(now.getMonth() / 3) + 1));
      fd.append('periodYear', String(now.getFullYear()));
    }
    if (req.frequency === 'HALF_YEARLY' || req.frequency === 'YEARLY') {
      fd.append('periodYear', String(now.getFullYear()));
    }

    this.safetyApi
      .uploadDocument(fd)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(req.uploadId ? 'Safety document reuploaded.' : 'Safety document uploaded.');
          this.loadWorkspace();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to upload safety document'),
      });
  }

  downloadLatest(): void {
    const req = this.selectedRequirement;
    if (!req?.latestDocument?.id) return;
    this.safetyApi
      .downloadBranch(req.latestDocument.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = req.latestDocument?.fileName || `${req.documentName}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Download failed'),
      });
  }

  statusClass(status: RequirementStatus): string {
    if (status === 'UPLOADED') return 'badge badge--good';
    if (status === 'EXPIRED') return 'badge badge--bad';
    return 'badge badge--warn';
  }

  dueClass(daysToExpiry: number | null): string {
    if (daysToExpiry === null) return 'badge badge--muted';
    if (daysToExpiry < 0) return 'badge badge--bad';
    if (daysToExpiry <= 15) return 'badge badge--warn';
    return 'badge badge--good';
  }

  dueText(daysToExpiry: number | null): string {
    if (daysToExpiry === null) return 'No validity window';
    if (daysToExpiry < 0) return `${Math.abs(daysToExpiry)}d overdue`;
    if (daysToExpiry === 0) return 'Due today';
    return `${daysToExpiry}d left`;
  }

  periodicityLabel(value: PeriodicityTab): string {
    if (value === 'HALF_YEARLY') return 'Half-Yearly';
    if (value === 'EVENT_BASED') return 'Event-Based';
    if (value === 'YEARLY') return 'Yearly';
    if (value === 'MONTHLY') return 'Monthly';
    if (value === 'QUARTERLY') return 'Quarterly';
    return 'All';
  }

  formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private loadWorkspace(): void {
    this.loading = true;
    forkJoin({
      docs: this.safetyApi.listForBranch().pipe(catchError(() => of([] as SafetyDocument[]))),
      expiring: this.safetyApi.getExpiringBranch().pipe(catchError(() => of([] as ExpiringDocument[]))),
      score: this.safetyApi.getSafetyScoreBranch().pipe(catchError(() => of(null))),
      master: this.safetyApi.getMasterList().pipe(catchError(() => of([] as MasterDocument[]))),
      required: this.branchId
        ? this.branchSafetyApi.getRequiredDocs(this.branchId).pipe(catchError(() => of(null)))
        : of(null),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ docs, expiring, score, master, required }) => {
          this.documents = docs || [];
          this.expiringDocs = expiring || [];
          this.safetyScore = score;
          this.masterList = master || [];
          this.requirements = this.buildRequirements(required, this.documents, this.masterList);
          this.applyFilters();
        },
        error: (err) => {
          this.documents = [];
          this.expiringDocs = [];
          this.safetyScore = null;
          this.masterList = [];
          this.requirements = [];
          this.filteredRequirements = [];
          this.selectedRequirement = null;
          this.toast.error(err?.error?.message || 'Failed to load safety workspace');
        },
      });
  }

  private buildRequirements(
    requiredRaw: unknown,
    docs: SafetyDocument[],
    masters: MasterDocument[],
  ): SafetyRequirementRow[] {
    const requiredPayload = this.extractRequiredPayload(requiredRaw);
    const rows: SafetyRequirementRow[] = [];

    if (requiredPayload.length) {
      for (const item of requiredPayload) {
        rows.push(this.mapRequirementItem(item, docs));
      }
      return rows.sort((a, b) => this.compareByStatusThenName(a, b));
    }

    // Fallback when branch-required API is unavailable: derive from safety master list.
    for (const m of masters) {
      rows.push(
        this.mapRequirementItem(
          {
            docMasterId: m.id,
            documentName: m.document_name,
            category: m.category,
            frequency: m.frequency,
            isMandatory: !!m.is_mandatory,
          },
          docs,
        ),
      );
    }
    return rows.sort((a, b) => this.compareByStatusThenName(a, b));
  }

  private mapRequirementItem(
    raw: SafetyRequiredDocPayload,
    docs: SafetyDocument[],
  ): SafetyRequirementRow {
    const normalizedFrequency = this.normalizeFrequency(raw.frequency);
    const matches = docs
      .filter((doc) => this.matchesRequirementDoc(raw, doc))
      .sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
    const latest = matches[0] || null;

    const expiryDays =
      latest?.validTo && !Number.isNaN(new Date(latest.validTo).getTime())
        ? Math.ceil((new Date(latest.validTo).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : null;

    let status: RequirementStatus = 'MISSING';
    if (latest) {
      if (expiryDays !== null && expiryDays < 0) status = 'EXPIRED';
      else status = latest.status?.toUpperCase() === 'ACTIVE' ? 'UPLOADED' : 'EXPIRED';
    } else if (raw.uploaded) {
      status = 'UPLOADED';
    }

    return {
      docMasterId: Number(raw.docMasterId || 0),
      documentName: String(raw.documentName || 'Safety Document'),
      category: String(raw.category || 'General'),
      frequency: normalizedFrequency,
      isMandatory: !!raw.isMandatory,
      status,
      uploadStatus: raw.uploadStatus || null,
      uploadId: latest?.id || raw.uploadId || null,
      latestDocument: latest,
      lastUploadedAt: latest?.createdAt || null,
      daysToExpiry: expiryDays,
    };
  }

  private matchesRequirementDoc(
    required: SafetyRequiredDocPayload,
    doc: SafetyDocument,
  ): boolean {
    if (required.uploadId && String(required.uploadId) === String(doc.id)) return true;

    const reqFreq = this.normalizeFrequency(required.frequency);
    const docFreq = this.normalizeFrequency(doc.frequency);
    const reqName = String(required.documentName || '').trim().toLowerCase();
    const docName = String(doc.documentName || '').trim().toLowerCase();
    const docType = String(doc.documentType || '').trim().toLowerCase();
    const reqCategory = String(required.category || '').trim().toLowerCase();
    const docCategory = String(doc.category || '').trim().toLowerCase();

    const nameMatch =
      !!reqName &&
      (docName === reqName ||
        docType === reqName ||
        docName.includes(reqName) ||
        reqName.includes(docName));
    const categoryMatch = !!reqCategory && !!docCategory && reqCategory === docCategory;

    if (nameMatch && (reqFreq === docFreq || reqFreq === 'ALL' || docFreq === 'ALL')) return true;
    if (!nameMatch && categoryMatch && reqFreq === docFreq) return true;
    return false;
  }

  private extractRequiredPayload(requiredRaw: unknown): SafetyRequiredDocPayload[] {
    if (!requiredRaw) return [];
    if (Array.isArray(requiredRaw)) return requiredRaw as SafetyRequiredDocPayload[];

    const payload = requiredRaw as { required?: unknown };
    if (Array.isArray(payload.required)) {
      return payload.required as SafetyRequiredDocPayload[];
    }
    return [];
  }

  private hydrateSelection(docMasterId: number | null): void {
    if (!this.filteredRequirements.length) {
      this.selectedRequirement = null;
      return;
    }

    if (docMasterId !== null) {
      const found = this.filteredRequirements.find((row) => row.docMasterId === docMasterId);
      if (found) {
        this.selectedRequirement = found;
        return;
      }
    }

    this.selectedRequirement = this.filteredRequirements[0];
  }

  private compareByStatusThenName(a: SafetyRequirementRow, b: SafetyRequirementRow): number {
    const rank = (value: RequirementStatus): number => {
      if (value === 'MISSING') return 0;
      if (value === 'EXPIRED') return 1;
      return 2;
    };
    const diff = rank(a.status) - rank(b.status);
    if (diff !== 0) return diff;
    return a.documentName.localeCompare(b.documentName);
  }

  private normalizeFrequency(value: string | null | undefined): PeriodicityTab {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/-/g, '_')
      .replace(/\s+/g, '_');

    if (normalized.includes('HALF')) return 'HALF_YEARLY';
    if (normalized.includes('QUART')) return 'QUARTERLY';
    if (normalized.includes('MONTH')) return 'MONTHLY';
    if (normalized.includes('ANNUAL') || normalized.includes('YEAR')) return 'YEARLY';
    if (normalized.includes('EVENT')) return 'EVENT_BASED';
    return 'ALL';
  }

  private backendFrequency(value: PeriodicityTab): string {
    if (value === 'YEARLY') return 'ANNUAL';
    return value;
  }

  private matchTabByDocument(doc: SafetyDocument): boolean {
    if (this.activePeriodicity === 'ALL') return true;
    return this.normalizeFrequency(doc.frequency) === this.activePeriodicity;
  }

  private isIncidentDoc(doc: SafetyDocument): boolean {
    const text = `${doc.category || ''} ${doc.documentName || ''} ${doc.documentType || ''}`.toLowerCase();
    return (
      text.includes('incident') ||
      text.includes('accident') ||
      text.includes('dangerous occurrence') ||
      this.normalizeFrequency(doc.frequency) === 'EVENT_BASED'
    );
  }

  private isTrainingDoc(doc: SafetyDocument): boolean {
    const text = `${doc.category || ''} ${doc.documentName || ''} ${doc.documentType || ''}`.toLowerCase();
    return text.includes('training') || text.includes('drill') || text.includes('awareness');
  }

  private isCommitteeDoc(doc: SafetyDocument): boolean {
    const text = `${doc.category || ''} ${doc.documentName || ''} ${doc.documentType || ''}`.toLowerCase();
    return text.includes('committee');
  }

  private timeValue(input?: string | null): number {
    if (!input) return 0;
    const value = new Date(input).getTime();
    return Number.isNaN(value) ? 0 : value;
  }
}

