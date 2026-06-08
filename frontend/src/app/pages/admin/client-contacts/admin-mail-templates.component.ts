import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  ClientContactsService,
  ClientCommType,
  MailTemplate,
} from './client-contacts.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

interface EditState {
  subjectTemplate: string;
  bodyTemplate: string;
  saving: boolean;
  previewSubject: string;
  previewBody: string;
  showPreview: boolean;
  source?: 'DB' | 'DEFAULT';
}

const TYPE_LABELS: Record<ClientCommType, string> = {
  PAYROLL_INPUT_REQUEST: 'Payroll Inputs Request (1st of month)',
  MCD_REQUEST: 'MCD Data Request (16th of month)',
};

@Component({
  selector: 'app-admin-mail-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  template: `
    <ui-page-header
      title="Monthly Mail Templates"
      subtitle="Edit subject & HTML body of the auto-sent payroll & MCD client emails"
      [breadcrumbs]="[
        { label: 'Admin', route: '/admin/dashboard' },
        { label: 'Client Contacts', route: '/admin/client-contacts' },
        { label: 'Mail Templates' }
      ]"
    ></ui-page-header>

    <div class="px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      <p class="text-sm text-slate-600">
        Use placeholders <code>{{ '{{clientName}}' }}</code>,
        <code>{{ '{{monthLabel}}' }}</code>,
        <code>{{ '{{deadlineLabel}}' }}</code>,
        <code>{{ '{{portalUrl}}' }}</code> — they get replaced at send-time.
        Body supports HTML.
      </p>

      <div *ngIf="loading()" class="text-slate-500">Loading templates…</div>

      <div *ngFor="let t of templates()" class="bg-white rounded-lg shadow border border-slate-200 p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-800">{{ labelFor(t.commType) }}</h3>
            <p class="text-xs text-slate-500">
              <span *ngIf="t.isCustom" class="text-emerald-700">Custom (saved {{ t.updatedAt | date: 'medium' }})</span>
              <span *ngIf="!t.isCustom" class="text-slate-500">Using built-in default</span>
            </p>
          </div>
          <div class="space-x-2">
            <button class="px-3 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-50"
                    (click)="resetToDefault(t)" [disabled]="state[t.commType].saving">Reset to default</button>
            <button class="px-3 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-50"
                    (click)="preview(t)">Preview</button>
            <button class="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    (click)="save(t)" [disabled]="state[t.commType].saving">
              {{ state[t.commType].saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Subject</span>
          <input class="mt-1 w-full border rounded px-3 py-2 text-sm font-mono"
                 [(ngModel)]="state[t.commType].subjectTemplate" />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">HTML Body</span>
          <textarea rows="14"
                    class="mt-1 w-full border rounded px-3 py-2 text-xs font-mono"
                    [(ngModel)]="state[t.commType].bodyTemplate"></textarea>
        </label>

        <div *ngIf="state[t.commType].showPreview" class="border-t pt-4 space-y-2">
          <div class="text-xs uppercase tracking-wide text-slate-500">
            Preview (using sample values — source: {{ state[t.commType].source }})
          </div>
          <div class="text-sm font-semibold">Subject: {{ state[t.commType].previewSubject }}</div>
          <div class="border rounded p-4 bg-slate-50 text-sm" [innerHTML]="state[t.commType].previewBody"></div>
        </div>
      </div>
    </div>
  `,
})
export class AdminMailTemplatesComponent implements OnInit {
  private readonly svc = inject(ClientContactsService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(ConfirmDialogService);

  loading = signal(true);
  templates = signal<MailTemplate[]>([]);
  state: Record<string, EditState> = {};

  ngOnInit(): void {
    this.refresh();
  }

  labelFor(t: ClientCommType) {
    return TYPE_LABELS[t];
  }

  refresh() {
    this.loading.set(true);
    this.svc.listTemplates().subscribe({
      next: (list) => {
        this.templates.set(list);
        for (const t of list) {
          this.state[t.commType] = {
            subjectTemplate: t.subjectTemplate,
            bodyTemplate: t.bodyTemplate,
            saving: false,
            previewSubject: '',
            previewBody: '',
            showPreview: false,
          };
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save(t: MailTemplate) {
    const s = this.state[t.commType];
    if (!s.subjectTemplate.trim() || !s.bodyTemplate.trim()) {
      this.toast.error('Subject and Body are required');
      return;
    }
    s.saving = true;
    this.svc
      .updateTemplate(t.commType, {
        subjectTemplate: s.subjectTemplate,
        bodyTemplate: s.bodyTemplate,
      })
      .subscribe({
        next: (r) => {
          s.saving = false;
          if (r.ok) {
            this.toast.success('Template saved');
            this.refresh();
          } else {
            this.toast.error(r.error || 'Save failed');
          }
        },
        error: (e) => {
          s.saving = false;
          this.toast.error(e?.error?.message || 'Save failed');
        },
      });
  }

  async resetToDefault(t: MailTemplate): Promise<void> {
    const ok = await this.dialog.confirm(
      'Reset Template',
      `Reset ${this.labelFor(t.commType)} to the built-in default?`,
      { confirmText: 'Reset' },
    );
    if (!ok) return;
    this.svc.resetTemplate(t.commType).subscribe({
      next: () => this.refresh(),
      error: (e) => this.toast.error(e?.error?.message || 'Reset failed'),
    });
  }

  preview(t: MailTemplate) {
    const s = this.state[t.commType];
    this.svc
      .previewTemplate(t.commType, {
        subjectTemplate: s.subjectTemplate,
        bodyTemplate: s.bodyTemplate,
      })
      .subscribe({
        next: (r) => {
          if (!r.ok) {
            this.toast.error(r.error || 'Preview failed');
            return;
          }
          s.previewSubject = r.subject || '';
          s.previewBody = r.body || '';
          s.source = r.source;
          s.showPreview = true;
        },
        error: (e) => this.toast.error(e?.error?.message || 'Preview failed'),
      });
  }
}
