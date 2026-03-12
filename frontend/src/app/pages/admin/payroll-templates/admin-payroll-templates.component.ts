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

import {
  AdminPayrollTemplate,
  AdminPayrollTemplateComponent,
  AdminPayrollTemplatesService,
} from './admin-payroll-templates.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-admin-payroll-templates',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './admin-payroll-templates.component.html',
  styleUrls: ['./admin-payroll-templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPayrollTemplatesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  saving = false;
  assigning = false;
  error: string | null = null;

  templates: AdminPayrollTemplate[] = [];
  filteredTemplates: AdminPayrollTemplate[] = [];
  selectedTemplate: AdminPayrollTemplate | null = null;
  clients: Array<{ id: string; label: string }> = [];
  clientAssignments: any[] = [];

  search = '';
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';

  form = this.blankForm();
  assignmentForm = {
    client_id: '',
    effective_from: this.todayDate(),
    effective_to: '',
  };

  constructor(
    private readonly api: AdminPayrollTemplatesService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      templates: this.api.getTemplates().pipe(catchError(() => of({ items: [], total: 0 }))),
      clients: this.api.getClients().pipe(catchError(() => of([]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ templates, clients }) => {
          this.templates = this.normalizeTemplates(templates);
          this.clients = this.normalizeClients(clients);
          this.applyFilters();

          if (!this.selectedTemplate && this.filteredTemplates.length) {
            this.selectTemplate(this.filteredTemplates[0]);
          }
        },
        error: (err: any) => {
          this.error =
            err?.error?.message || 'Failed to load payroll templates workspace.';
          this.templates = [];
          this.filteredTemplates = [];
          this.selectedTemplate = null;
        },
      });
  }

  applyFilters(): void {
    const term = this.search.trim().toLowerCase();
    this.filteredTemplates = this.templates.filter((t) => {
      if (this.statusFilter === 'ACTIVE' && !t.is_active) return false;
      if (this.statusFilter === 'INACTIVE' && t.is_active) return false;
      if (!term) return true;
      return (
        (t.name || '').toLowerCase().includes(term) ||
        (t.fileName || '').toLowerCase().includes(term) ||
        (t.fileType || '').toLowerCase().includes(term)
      );
    });

    if (
      this.selectedTemplate &&
      !this.filteredTemplates.some((t) => t.id === this.selectedTemplate!.id)
    ) {
      this.selectedTemplate = null;
      this.form = this.blankForm();
      this.clientAssignments = [];
    }
    this.cdr.markForCheck();
  }

  newTemplate(): void {
    this.selectedTemplate = null;
    this.form = this.blankForm();
    this.clientAssignments = [];
    this.cdr.markForCheck();
  }

  selectTemplate(template: AdminPayrollTemplate): void {
    this.api
      .getTemplateById(template.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detail) => {
          this.selectedTemplate = detail;
          this.form = {
            name: detail.name || '',
            fileName: detail.fileName || '',
            filePath: detail.filePath || '',
            fileType: detail.fileType || '',
            version: Number(detail.version || 1),
            is_active: !!detail.is_active,
          };

          if (this.assignmentForm.client_id) {
            this.loadClientAssignments(this.assignmentForm.client_id);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Could not open template details.');
        },
      });
  }

  saveTemplate(): void {
    const payload = {
      name: this.form.name.trim(),
      fileName: this.form.fileName.trim(),
      filePath: this.form.filePath.trim(),
      fileType: (this.form.fileType || '').trim() || undefined,
      version: Number(this.form.version || 1),
      is_active: !!this.form.is_active,
    };

    if (!payload.name || !payload.fileName || !payload.filePath) {
      this.toast.warning('Name, file name, and file path are required.');
      return;
    }

    this.saving = true;
    const request$ = this.selectedTemplate
      ? this.api.updateTemplate(this.selectedTemplate.id, payload)
      : this.api.createTemplate(payload);

    request$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved: any) => {
          this.toast.success(
            this.selectedTemplate ? 'Payroll template updated.' : 'Payroll template created.',
          );
          const id = saved?.id || this.selectedTemplate?.id || null;
          this.loadAll();
          if (id) {
            setTimeout(() => {
              const found = this.templates.find((t) => t.id === id);
              if (found) this.selectTemplate(found);
            }, 50);
          }
        },
        error: (err: any) => {
          this.toast.error(err?.error?.message || 'Could not save template.');
        },
      });
  }

  createNextVersion(): void {
    if (!this.selectedTemplate) return;

    const nextVersion = Number(this.selectedTemplate.version || 1) + 1;
    const baseName = this.baseTemplateName(this.selectedTemplate.name);
    const proposedName = `${baseName} v${nextVersion}`;

    this.saving = true;
    this.api
      .createTemplate({
        name: proposedName,
        fileName: this.selectedTemplate.fileName,
        filePath: this.selectedTemplate.filePath,
        fileType: this.selectedTemplate.fileType || undefined,
        version: nextVersion,
        is_active: this.selectedTemplate.is_active,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Created ${proposedName}.`);
          this.loadAll();
        },
        error: (err: any) => {
          this.toast.error(
            err?.error?.message || 'Could not create next version. Name might already exist.',
          );
        },
      });
  }

  loadClientAssignments(clientId: string): void {
    if (!clientId) {
      this.clientAssignments = [];
      return;
    }
    this.assignmentForm.client_id = clientId;
    this.api
      .getClientAssignments(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any[]) => {
          this.clientAssignments = Array.isArray(rows) ? rows : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.clientAssignments = [];
          this.cdr.markForCheck();
        },
      });
  }

  assignToClient(): void {
    if (!this.selectedTemplate) {
      this.toast.warning('Pick a template before assignment.');
      return;
    }
    if (!this.assignmentForm.client_id || !this.assignmentForm.effective_from) {
      this.toast.warning('Client and effective from date are required.');
      return;
    }

    this.assigning = true;
    this.api
      .assignTemplateToClient({
        client_id: this.assignmentForm.client_id,
        template_id: this.selectedTemplate.id,
        effective_from: this.assignmentForm.effective_from,
        effective_to: this.assignmentForm.effective_to || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.assigning = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Template linked to client.');
          this.loadClientAssignments(this.assignmentForm.client_id);
        },
        error: (err: any) => {
          this.toast.error(err?.error?.message || 'Could not assign template.');
        },
      });
  }

  get componentRows(): AdminPayrollTemplateComponent[] {
    return this.selectedTemplate?.components || [];
  }

  get versionHistory(): AdminPayrollTemplate[] {
    if (!this.selectedTemplate) return [];
    const base = this.baseTemplateName(this.selectedTemplate.name);
    return this.templates
      .filter((t) => this.baseTemplateName(t.name) === base)
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
  }

  private normalizeTemplates(payload: any): AdminPayrollTemplate[] {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
      ? payload.items
      : [];
    return rows.map((t: any) => ({
      ...t,
      version: Number(t?.version || 1),
      is_active: !!t?.is_active,
    }));
  }

  private normalizeClients(payload: any): Array<{ id: string; label: string }> {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    return rows
      .map((c: any) => ({
        id: String(c?.id || c?.clientId || ''),
        label: String(c?.clientName || c?.name || 'Unknown Client'),
      }))
      .filter((c: any) => !!c.id)
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }

  private baseTemplateName(name: string): string {
    return String(name || '')
      .replace(/\s+v\d+$/i, '')
      .trim();
  }

  private blankForm() {
    return {
      name: '',
      fileName: '',
      filePath: '',
      fileType: '',
      version: 1,
      is_active: true,
    };
  }

  private todayDate(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
