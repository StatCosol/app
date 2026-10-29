import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuditFilePreviewComponent, AuditFilePreview } from '../files/components/audit-file-preview.component';
import {
  ProtectedFileService,
  ProtectedFileHandle,
} from '../files/services/protected-file.service';

interface Evidence {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  description: string;
  location: string;
  uploadedRole: string;
  uploadedByName: string;
  createdAt: string;
  revision: number;
  url: string;
}
interface AuditPoint {
  id: string;
  itemLabel: string;
  kind: string;
  status: string;
  remarks: string;
  automatedRemarks: string;
  automationReviewed: boolean;
  revision: number;
  reviewedAt: string;
  reviewedByName: string;
  evidence: Evidence[];
  history: any[];
}
interface Draft {
  revision: number;
  remarks: string;
  decision: string;
  verified: boolean;
  description: string;
  location: string;
  file: File | null;
}
@Component({
  standalone: true,
  selector: 'app-audit-fieldwork',
  imports: [CommonModule, FormsModule, AuditFilePreviewComponent],
  templateUrl: './audit-fieldwork.component.html',
  styleUrls: ['./audit-fieldwork.component.scss'],
})
export class AuditFieldworkComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) auditId = '';
  @Input() auditor = false;
  @Output() changed = new EventEmitter<void>();
  audit: any = null;
  items: AuditPoint[] = [];
  canEdit = false;
  availablePoints = 0;
  loading = false;
  busy = false;
  error = '';
  message = '';
  search = '';
  filter = 'ALL';
  selectedId = '';
  evidenceFilter = '';
  drafts: Record<string, Draft> = {};
  newLabel = '';
  newKind = 'SITE_INSPECTION';
  adding = false;
  preview: ProtectedFileHandle | null = null;
  previewName = '';
  documentPreview: AuditFilePreview | null = null;
  private requests = new Subscription();
  private loadRequest?: Subscription;
  private generation = 0;
  private previewGeneration = 0;
  private base = (environment.apiBaseUrl || '') + '/api/v1/audit-fieldwork/';
  constructor(
    private http: HttpClient,
    private files: ProtectedFileService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnChanges() {
    this.generation++;
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.closePreview();
    this.drafts = {};
    this.items = [];
    this.audit = null;
    this.availablePoints = 0;
    this.selectedId = '';
    this.search = '';
    this.filter = 'ALL';
    this.evidenceFilter = '';
    this.busy = false;
    this.message = '';
    this.load();
  }
  ngOnDestroy() {
    this.generation++;
    this.loadRequest?.unsubscribe();
    this.requests.unsubscribe();
    this.closePreview();
  }
  get selected() {
    return this.visible.find((i) => i.id === this.selectedId);
  }
  get visibleEvidence() {
    return (this.selected?.evidence || []).filter(file => !this.evidenceFilter || file.id === this.evidenceFilter);
  }
  changeFilters() {
    this.closePreview();
    this.evidenceFilter = '';
    if (!this.selected) this.selectedId = this.visible[0]?.id || '';
    this.error = '';
    this.message = '';
  }
  get draft() {
    return this.drafts[this.selectedId];
  }
  get counts() {
    return {
      total: this.items.length,
      reviewed: this.items.filter((i) =>
        ['COMPLIED', 'NON_COMPLIED', 'NOT_APPLICABLE'].includes(i.status),
      ).length,
      waiting: this.items.filter((i) => i.status === 'UPLOADED').length,
      corrections: this.items.filter((i) => i.status === 'NON_COMPLIED').length,
    };
  }
  get percent() {
    return this.counts.total ? Math.round((this.counts.reviewed / this.counts.total) * 100) : 0;
  }
  get visible() {
    const q = this.search.trim().toLowerCase();
    return this.items.filter(
      (i) =>
        (!q || i.itemLabel.toLowerCase().includes(q)) &&
        (this.filter === 'ALL' ||
          (this.filter === 'SITE_INSPECTION' && i.kind === 'SITE_INSPECTION') ||
          (this.filter === 'DOCUMENT' && i.kind === 'DOCUMENT') ||
          (this.filter === 'PENDING' && ['PENDING', 'UPLOADED'].includes(i.status)) ||
          i.status === this.filter),
    );
  }
  label(status: string) {
    return (
      (
        {
          PENDING: 'Awaiting evidence',
          UPLOADED: 'Ready for review',
          COMPLIED: 'Verified',
          NON_COMPLIED: 'Correction needed',
          NOT_APPLICABLE: 'Not applicable',
          SITE_INSPECTION: 'Site inspection',
          DOCUMENT: 'Document review',
        } as Record<string, string>
      )[status] || status?.replaceAll('_', ' ')
    );
  }
  load() {
    if (!this.auditId) return;
    this.loadRequest?.unsubscribe();
    this.loading = true;
    this.error = '';
    const epoch = this.generation;
    this.loadRequest = this.http.get<any>(this.base + this.auditId).subscribe({
      next: (r) => {
        if (epoch !== this.generation) return;
        this.audit = r.audit;
        this.items = r.items;
        this.canEdit = r.canEdit;
        this.availablePoints = r.availablePoints || 0;
        for (const i of this.items) {
          const draft = this.drafts[i.id];
          if (draft && draft.revision !== i.revision) {
            draft.revision = i.revision;
            draft.decision = 'PENDING';
            draft.verified = false;
          }
          this.drafts[i.id] ??= {
            revision: i.revision,
            remarks: i.remarks || '',
            decision: ['PENDING', 'UPLOADED'].includes(i.status) ? 'PENDING' : i.status,
            verified: i.automationReviewed,
            description: '',
            location: '',
            file: null,
          };
        }
        if (!this.selected) {
          this.closePreview();
          this.evidenceFilter = '';
          this.selectedId = this.visible[0]?.id || '';
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        if (epoch !== this.generation) return;
        this.loading = false;
        this.error = this.errorText(e);
        this.cdr.markForCheck();
      },
    });
  }
  select(item: AuditPoint) {
    if (this.busy || !this.visible.some(row => row.id === item.id)) return;
    this.closePreview();
    this.evidenceFilter = '';
    this.selectedId = item.id;
    this.error = '';
    this.message = '';
  }
  fileChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.draft.file = null;
      this.error = 'Choose a file smaller than 10 MB.';
      input.value = '';
      return;
    }
    this.draft.file = file;
    this.error = '';
  }
  upload() {
    const item = this.selected,
      d = this.draft;
    if (!item || !d?.file || this.busy || !this.canEdit) return;
    if (d.description.trim().length < 5) {
      this.error = 'Describe the document or what you observed at the site.';
      return;
    }
    const body = new FormData();
    body.append('file', d.file);
    body.append('description', d.description.trim());
    body.append('location', d.location.trim());
    this.mutate('items/' + item.id + '/evidence', body, () => {
      d.file = null;
      d.description = '';
      d.location = '';
      delete this.drafts[item.id];
      this.message = 'Evidence uploaded. The auditor can now review this point.';
    });
  }
  saveReview() {
    const item = this.selected,
      d = this.draft;
    if (!item || !this.auditor || !this.canEdit || this.busy || this.loading) return;
    if (d.remarks.trim().length < 5) {
      this.error = 'Add remarks explaining the evidence checked and your decision.';
      return;
    }
    this.mutate(
      'items/' + item.id + '/review',
      {
        decision: d.decision,
        remarks: d.remarks.trim(),
        revision: item.revision,
        automationReviewed: d.verified,
      },
      () => {
        delete this.drafts[item.id];
        this.message = 'Review saved with your remarks.';
      },
    );
  }
  refreshChecklist() {
    if (!this.auditor || !this.canEdit || this.loading || this.busy || !this.availablePoints)
      return;
    this.mutate('checklist/refresh', {}, (r) => {
      this.message = r.created
        ? `${r.created} missing audit points added. Existing evidence and reviews are preserved.`
        : 'This audit already has the latest checklist points.';
    });
  }
  addPoint() {
    if (
      !this.auditor ||
      !this.canEdit ||
      this.loading ||
      this.newLabel.trim().length < 3 ||
      this.busy
    )
      return;
    this.mutate('items', { label: this.newLabel.trim(), kind: this.newKind }, (r) => {
      this.selectedId = r.id;
      this.newLabel = '';
      this.adding = false;
      this.filter = 'ALL';
      this.search = '';
      this.message = 'Audit point added. The client can upload supporting documents here.';
    });
  }
  private mutate(route: string, body: any, success: (r: any) => void) {
    this.busy = true;
    this.error = '';
    this.message = '';
    const epoch = this.generation;
    this.requests.add(
      this.http.post<any>(this.base + this.auditId + '/' + route, body).subscribe({
        next: (r) => {
          if (epoch !== this.generation) return;
          this.busy = false;
          success(r);
          this.load();
          this.changed.emit();
          this.cdr.markForCheck();
        },
        error: (e) => {
          if (epoch !== this.generation) return;
          this.busy = false;
          this.error = this.errorText(e);
          if (e.status === 409) this.loadPreservingError();
          this.cdr.markForCheck();
        },
      }),
    );
  }
  private loadPreservingError() {
    const message = this.error;
    this.load();
    this.error = message;
  }
  view(e: Evidence) {
    this.closePreview();
    this.error = '';
    if (!e.mimeType.startsWith('image/')) {
      this.documentPreview = { url: e.url, name: e.fileName };
      return;
    }
    const epoch = this.generation;
    const point = this.selectedId;
    const previewEpoch = this.previewGeneration;
    this.requests.add(
      this.files.fetch(e.url, e.fileName).subscribe({
        next: (f) => {
          if (
            epoch !== this.generation ||
            point !== this.selectedId ||
            previewEpoch !== this.previewGeneration
          ) {
            f.revoke();
            return;
          }
          this.preview = f;
          this.previewName = e.fileName;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = this.errorText(err);
          this.cdr.markForCheck();
        },
      }),
    );
  }
  download(e: Evidence) {
    this.requests.add(
      this.files.download(e.url, e.fileName).subscribe({
        error: (err) => {
          this.error = this.errorText(err);
          this.cdr.markForCheck();
        },
      }),
    );
  }
  closePreview() {
    this.documentPreview = null;
    this.previewGeneration++;
    this.preview?.revoke();
    this.preview = null;
  }
  private errorText(e: any) {
    const m = e?.error?.message;
    return Array.isArray(m)
      ? m.join('. ')
      : typeof m === 'string'
        ? m
        : 'Unable to complete this action. Please try again.';
  }
}
