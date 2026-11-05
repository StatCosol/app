import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProtectedFileService } from '../../shared/files/services/protected-file.service';

interface Assignment {
  id: string;
  clientId: string;
  clientName: string;
  branchId: string | null;
  branchName: string | null;
  contractorId: string | null;
  contractorName: string | null;
  auditType: string;
  auditCode: string;
  periodCode: string;
  status: string;
  auditorName: string;
}
interface Category {
  name: string;
  count: number;
}
interface Point {
  id: string;
  category: string;
  serial: number;
  head: string;
  statute: string;
  legalProvision: string | null;
  auditParameter: string | null;
  description: string;
  relevantForm: string | null;
  dueDate: string | null;
  maxMarks: number;
  riskType: string;
  answerOptions: string[] | null;
}
interface Answer {
  answer: string;
  status: string;
  remarks: string;
  version: number;
}
@Component({
  standalone: true,
  selector: 'app-auditor-statutory-entry',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './auditor-statutory-entry.component.html',
  styleUrls: ['./auditor-statutory-entry.component.scss'],
})
export class AuditorStatutoryEntryComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private files = inject(ProtectedFileService);
  readonly base = `${environment.apiBaseUrl}/api/v1/auditor/statutory-audit-entry`;
  assignments: Assignment[] = [];
  categories: Category[] = [];
  types: { value: string; label: string; available: boolean }[] = [];
  missing: string[] = [];
  clientId = '';
  unitType = 'FACTORY';
  branchId = '';
  auditId = '';
  category = '';
  search = '';
  statusFilter = '';
  page = 1;
  readonly pageSize = 20;
  audit: Assignment | null = null;
  session: any = null;
  items: Point[] = [];
  drafts: Record<string, Answer> = {};
  saved: Record<string, Answer> = {};
  evidence: Record<string, string> = {};
  dirty = new Set<string>();
  auditeeName = '';
  auditMode = 'PHYSICAL';
  scope: string[] = [];
  scopeAcknowledged = false;
  busy = false;
  loading = true;
  error = '';
  message = '';
  showSubmit = false;
  documents: Record<string, any> = {};
  reviewRemarks: Record<string, string> = {};
  get clients() {
    return [
      ...new Map(
        this.assignments.map((a) => [a.clientId, { id: a.clientId, name: a.clientName }]),
      ).values(),
    ];
  }
  get typeAssignments() {
    return this.assignments.filter(
      (a) => a.clientId === this.clientId && a.auditType === this.unitType && !a.contractorId,
    );
  }
  get units() {
    return [
      ...new Map(
        this.typeAssignments.map((a) => [
          a.branchId || 'company',
          { id: a.branchId || 'company', name: a.branchName || 'Company-wide' },
        ]),
      ).values(),
    ];
  }
  get audits() {
    return this.typeAssignments.filter((a) => (a.branchId || 'company') === this.branchId);
  }
  get supported() {
    return this.types.find((t) => t.value === this.unitType)?.available === true;
  }
  get readonly() {
    return (
      !!this.session?.submitted_at ||
      (!!this.audit && !['PLANNED', 'IN_PROGRESS'].includes(this.audit.status))
    );
  }
  get completed() {
    return Object.keys(this.saved).length;
  }
  get filtered() {
    const q = this.search.toLowerCase().trim();
    return this.items.filter(
      (p) =>
        (!this.category || p.category === this.category) &&
        (!this.statusFilter || (this.saved[p.id]?.status || 'PENDING') === this.statusFilter) &&
        (!q ||
          `${p.description} ${p.statute} ${p.auditParameter || ''} ${p.head}`
            .toLowerCase()
            .includes(q)),
    );
  }
  get pages() {
    return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
  }
  get visible() {
    return this.filtered.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }
  get scopeCount() {
    return this.categories
      .filter((c) => this.scope.includes(c.name))
      .reduce((n, c) => n + c.count, 0);
  }
  get canSubmit() {
    return (
      !!this.session &&
      !this.readonly &&
      !this.busy &&
      !this.dirty.size &&
      this.items.length > 0 &&
      this.completed === this.items.length
    );
  }
  async ngOnInit() {
    try {
      const [catalogue, assignments] = await Promise.all([
        firstValueFrom(this.http.get<any>(`${this.base}/catalogue`)),
        firstValueFrom(this.http.get<Assignment[]>(`${this.base}/assignments`)),
      ]);
      this.categories = catalogue.categories;
      this.types = catalogue.types;
      this.missing = catalogue.missingCategories;
      this.assignments = assignments;
      this.scope = this.categories.map((c) => c.name);
      const requested = this.route.snapshot.queryParamMap.get('auditId');
      const selected = this.assignments.find((a) => a.id === requested);
      if (selected) {
        this.clientId = selected.clientId;
        this.unitType = selected.auditType;
        this.branchId = selected.branchId || 'company';
        await this.selectAudit(selected.id);
      }
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading = false;
    }
  }
  fail(e: any) {
    this.error =
      e?.error?.message instanceof Array
        ? e.error.message.join('. ')
        : e?.error?.message || 'Unable to complete the request. Please try again.';
  }
  canLeave() {
    return (
      !this.busy &&
      (!this.dirty.size || window.confirm('Leave this audit and discard unsaved point edits?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(e: BeforeUnloadEvent) {
    if (this.dirty.size || this.busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  changeContext(field: 'clientId' | 'unitType' | 'branchId', value: string) {
    if (!this.canLeave()) return;
    this[field] = value;
    if (field !== 'branchId') this.branchId = '';
    this.auditId = '';
    this.audit = null;
    this.session = null;
    this.items = [];
    this.saved = {};
    this.drafts = {};
    this.evidence = {};
    this.dirty.clear();
    this.error = '';
    this.message = '';
    this.showSubmit = false;
  }
  async selectAudit(id: string) {
    if (!this.canLeave()) return;
    this.auditId = id;
    this.audit = this.assignments.find((a) => a.id === id) || null;
    this.items = [];
    this.session = null;
    this.saved = {};
    this.drafts = {};
    this.dirty.clear();
    this.evidence = {};
    this.category = '';
    this.page = 1;
    this.search = '';
    this.statusFilter = '';
    this.error = '';
    this.message = '';
    this.showSubmit = false;
    this.auditeeName = '';
    this.scopeAcknowledged = false;
    this.scope = this.categories.map((c) => c.name);
    if (id) await this.load();
  }
  async load() {
    this.busy = true;
    try {
      const data = await firstValueFrom(this.http.get<any>(`${this.base}/${this.auditId}`));
      this.session = data.session;
      this.items = data.items;
      this.saved = {};
      this.drafts = {};
      this.evidence = {};
      if (this.audit) this.audit.status = data.auditStatus;
      for (const p of this.items)
        this.drafts[p.id] = { answer: '', status: '', remarks: '', version: 0 };
      for (const a of data.answers) {
        const answer = {
          answer: a.answer,
          status: a.status,
          remarks: a.remarks,
          version: a.version,
        };
        if (!a.stale) this.saved[a.item_id] = answer;
        this.drafts[a.item_id] = { ...answer };
      }
      for (const e of data.evidence) this.evidence[e.item_id] = e.filename;
      this.documents = {};
      this.reviewRemarks = {};
      for (const d of data.documents) {
        this.documents[d.item_id] = d;
        this.reviewRemarks[d.item_id] = d.review_remarks || '';
      }
      this.dirty.clear();
      for (const a of data.answers) if (a.stale) this.dirty.add(a.item_id);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  toggleScope(name: string, checked: boolean) {
    this.scope = checked ? [...this.scope, name] : this.scope.filter((n) => n !== name);
  }
  async configure() {
    this.busy = true;
    this.error = '';
    try {
      await firstValueFrom(
        this.http.post(`${this.base}/${this.auditId}/scope`, {
          unitType: this.unitType,
          auditMode: this.auditMode,
          auditeeName: this.auditeeName,
          categories: this.scope,
          scopeAcknowledged: this.scopeAcknowledged,
        }),
      );
      this.busy = false;
      await this.load();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  edit(id: string) {
    this.dirty.add(id);
    this.message = '';
  }
  async save(point: Point) {
    this.busy = true;
    this.error = '';
    try {
      const result = await firstValueFrom(
        this.http.put<any>(
          `${this.base}/${this.auditId}/points/${encodeURIComponent(point.id)}`,
          this.drafts[point.id],
        ),
      );
      this.saved[point.id] = {
        answer: result.answer,
        status: result.status,
        remarks: result.remarks,
        version: result.version,
      };
      this.drafts[point.id] = { ...this.saved[point.id] };
      this.dirty.delete(point.id);
      this.message = `Point ${point.serial} saved.`;
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  async upload(point: Point, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      file.size > 5 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)
    ) {
      this.error = 'Choose a PNG, JPEG or PDF up to 5 MB.';
      input.value = '';
      return;
    }
    if (this.evidence[point.id] && !window.confirm('Replace the saved evidence for this point?')) {
      input.value = '';
      return;
    }
    const form = new FormData();
    form.append('file', file);
    this.busy = true;
    this.error = '';
    try {
      const result = await firstValueFrom(
        this.http.post<any>(
          `${this.base}/${this.auditId}/points/${encodeURIComponent(point.id)}/evidence`,
          form,
        ),
      );
      this.evidence[point.id] = result.filename;
      this.message = 'Evidence saved.';
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      input.value = '';
    }
  }
  async download(ncOnly = false) {
    this.busy = true;
    this.error = '';
    try {
      await firstValueFrom(
        this.files.download(
          `${this.base}/${this.auditId}/export?ncOnly=${ncOnly}`,
          `audit-${this.audit?.auditCode || this.auditId}${ncOnly ? '-NC' : ''}.xlsx`,
        ),
      );
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  async openEvidence(point: Point) {
    this.error = '';
    try {
      await firstValueFrom(
        this.files.download(
          `${this.base}/${this.auditId}/points/${encodeURIComponent(point.id)}/evidence`,
          this.evidence[point.id],
        ),
      );
    } catch (e) {
      this.fail(e);
    }
  }
  async refreshDocuments() {
    this.busy = true;
    this.error = '';
    try {
      const data = await firstValueFrom(this.http.get<any>(`${this.base}/${this.auditId}`));
      this.documents = {};
      for (const d of data.documents) {
        this.documents[d.item_id] = d;
        this.reviewRemarks[d.item_id] = d.review_remarks || '';
      }
      for (const a of data.answers)
        if (a.stale) {
          delete this.saved[a.item_id];
          this.dirty.add(a.item_id);
        }
      if (this.audit) this.audit.status = data.auditStatus;
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  async reloadSaved() {
    if (this.canLeave()) {
      this.error = '';
      await this.load();
    }
  }
  async openDocument(p: Point) {
    try {
      const d = this.documents[p.id];
      await firstValueFrom(
        this.files.download(`${this.base}/${this.auditId}/documents/${d.id}`, d.filename),
      );
    } catch (e) {
      this.fail(e);
    }
  }
  async reviewDocument(p: Point, status: string) {
    this.busy = true;
    this.error = '';
    try {
      const d = this.documents[p.id];
      const result = await firstValueFrom(
        this.http.put<any>(`${this.base}/${this.auditId}/documents/${d.id}/review`, {
          status,
          remarks: this.reviewRemarks[p.id] || '',
          version: d.review_version,
        }),
      );
      d.review_status = status;
      d.review_version = result.version;
      d.review_remarks = this.reviewRemarks[p.id];
      delete this.saved[p.id];
      this.dirty.add(p.id);
      this.message = 'Document reviewed. Save the compliance point to record your conclusion.';
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  async submit() {
    if (!this.canSubmit) return;
    this.busy = true;
    this.error = '';
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.apiBaseUrl}/api/v1/auditor/audits/${this.auditId}/submit`,
          {},
        ),
      );
      this.showSubmit = false;
      this.message = 'Audit submitted. Non-compliances are available in the correction workflow.';
      await this.load();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
}
