import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProtectedFileService } from '../files/services/protected-file.service';

@Component({
  standalone: true,
  selector: 'app-auditee-audit-documents',
  imports: [CommonModule, FormsModule],
  templateUrl: './auditee-audit-documents.component.html',
  styleUrls: ['../../pages/auditor/auditor-statutory-entry.component.scss'],
})
export class AuditeeAuditDocumentsComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private files = inject(ProtectedFileService);
  readonly base = `${environment.apiBaseUrl}/api/v1/auditee/statutory-audit-entry`;
  audits: any[] = [];
  auditId = '';
  items: any[] = [];
  documents: Record<string, any> = {};
  auditeeName = '';
  readonly = false;
  locked = false;
  loading = true;
  busy = false;
  error = '';
  message = '';
  category = '';
  search = '';
  status = '';
  page = 1;
  readonly pageSize = 20;
  get categories(): string[] {
    return [...new Set(this.items.map((p) => p.category as string))];
  }
  get uploaded() {
    return Object.keys(this.documents).length;
  }
  get filtered() {
    const q = this.search.trim().toLowerCase();
    return this.items.filter(
      (p) =>
        (!this.category || p.category === this.category) &&
        (!this.status || (this.documents[p.id]?.review_status || 'MISSING') === this.status) &&
        (!q || `${p.description} ${p.statute} ${p.auditParameter || ''}`.toLowerCase().includes(q)),
    );
  }
  get pages() {
    return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
  }
  get visible() {
    return this.filtered.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }
  fail(e: any) {
    this.error = Array.isArray(e?.error?.message)
      ? e.error.message.join('. ')
      : e?.error?.message || 'Unable to complete the request. Please try again.';
  }
  canLeave() {
    return !this.busy;
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(e: BeforeUnloadEvent) {
    if (this.busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  async ngOnInit() {
    try {
      this.audits = await firstValueFrom(this.http.get<any[]>(this.base));
      const requested = this.route.snapshot.queryParamMap.get('auditId');
      const selected =
        this.audits.find((a) => a.id === requested) ||
        (this.audits.length === 1 ? this.audits[0] : null);
      if (selected) await this.selectAudit(selected.id);
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading = false;
    }
  }
  async selectAudit(id: string) {
    if (this.busy) return;
    this.auditId = id;
    this.items = [];
    this.documents = {};
    this.error = '';
    this.message = '';
    this.category = '';
    this.search = '';
    this.status = '';
    this.page = 1;
    if (id) await this.refresh();
  }
  async refresh() {
    this.busy = true;
    this.error = '';
    try {
      const data = await firstValueFrom(this.http.get<any>(`${this.base}/${this.auditId}`));
      this.items = data.items;
      this.readonly = data.readonly;
      this.locked = data.uploadLocked;
      this.auditeeName = data.auditeeName;
      this.documents = Object.fromEntries(data.documents.map((d: any) => [d.item_id, d]));
      this.page = Math.min(this.page, this.pages);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  async upload(point: any, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !/\.(pdf|png|jpe?g|docx?|xlsx?|csv|txt)$/i.test(file.name)
    ) {
      this.error = 'Choose a PDF, image, Word, Excel, CSV or text document up to 10 MB.';
      input.value = '';
      return;
    }
    if (
      this.documents[point.id] &&
      !window.confirm(
        'Upload a new version for this point? The auditor will need to review it again.',
      )
    ) {
      input.value = '';
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    const form = new FormData();
    form.append('file', file);
    try {
      const document = await firstValueFrom(
        this.http.post<any>(
          `${this.base}/${this.auditId}/points/${encodeURIComponent(point.id)}/documents`,
          form,
        ),
      );
      this.documents[point.id] = document;
      this.message = `Document for point ${point.serial} uploaded. Awaiting auditor review.`;
      this.page = Math.min(this.page, this.pages);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      input.value = '';
    }
  }
  async download(document: any) {
    try {
      await firstValueFrom(
        this.files.download(
          `${this.base}/${this.auditId}/documents/${document.id}`,
          document.filename,
        ),
      );
    } catch (e) {
      this.fail(e);
    }
  }
}
