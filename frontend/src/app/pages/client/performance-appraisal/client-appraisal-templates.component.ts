import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalTemplate } from '../../../core/models/appraisal.models';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-client-appraisal-templates',
  standalone: true,
  imports: [IconComponent, CommonModule, FormsModule, RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../shared/client-theme.scss', './client-appraisal-theme.scss'],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Appraisal Templates"
        subtitle="Manage rating templates used in appraisal cycles">
        <a routerLink="/client/appraisal-cycles" class="appraisal-action">Cycles</a>
        <button type="button" class="standard-action appraisal-action appraisal-action--primary" [disabled]="creating" (click)="showCreate = !showCreate" [title]="showCreate ? 'Close Form' : 'New Template'" [attr.aria-label]="showCreate ? 'Close Form' : 'New Template'">@if (!showCreate) { <ui-icon name="plus" [size]="20" /> }<span>
          {{ showCreate ? 'Close Form' : 'New Template' }}
        </span></button>
      </ui-page-header>
      @if (createError) { <div role="alert" class="table-card mb-4 text-red-700">{{ createError }}</div> }
      @if (createMessage) { <div role="status" class="table-card mb-4">{{ createMessage }}</div> }

      @if (showCreate) {
        <div class="table-card mb-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-medium text-gray-600 block mb-1" for="tpl-code">Template Code</label>
              <input id="tpl-code" class="search-input" [(ngModel)]="draft.templateCode" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-600 block mb-1" for="tpl-name">Template Name</label>
              <input id="tpl-name" class="search-input" [(ngModel)]="draft.templateName" />
            </div>
          </div>
          <button type="button" class="standard-action appraisal-action appraisal-action--primary mt-4" [disabled]="creating" (click)="createTemplate()" title="Create Template" aria-label="Create Template"><ui-icon name="plus" [size]="20" /><span>
            {{ creating ? 'Saving...' : 'Create Template' }}
          </span></button>
        </div>
      }

      @if (loading) {
        <div class="flex items-center justify-center py-20"><div class="spinner"></div></div>
      } @else if (loadError) {
        <div role="alert" class="table-card text-red-700">{{ loadError }} <button type="button" class="standard-action" (click)="reload()">Retry</button></div>
      } @else if (!templates.length) {
        <div class="table-card text-sm text-gray-500 py-10 text-center">No templates yet.</div>
      } @else {
        <div class="table-card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Sections</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (t of templates; track t.id) {
                <tr class="data-row">
                  <td class="font-mono text-xs">{{ t.templateCode }}</td>
                  <td>{{ t.templateName }}</td>
                  <td>{{ t.sections?.length || 0 }}</td>
                  <td>{{ t.isActive === false ? 'Inactive' : 'Active' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ClientAppraisalTemplatesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;
  private loadVersion = 0;
  loadError = '';
  createError = '';
  createMessage = '';
  loading = false;
  creating = false;
  showCreate = false;
  templates: AppraisalTemplate[] = [];
  draft = { templateCode: '', templateName: '' };

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    if (this.destroyed) return;
    const version = ++this.loadVersion;
    const current = () => !this.destroyed && version === this.loadVersion;
    this.loadError = '';
    this.templates = [];
    this.loading = true;
    this.cdr.markForCheck();
    this.svc
      .getTemplates()
      .pipe(takeUntil(this.destroy$), finalize(() => {
        if (current()) { this.loading = false; this.cdr.markForCheck(); }
      }))
      .subscribe({
        next: (rows) => {
          if (!current()) return;
          this.templates = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          if (!current()) return;
          this.loadError = 'Appraisal templates could not be loaded. Retry before relying on this list.';
          this.cdr.markForCheck();
        },
      });
  }

  createTemplate(): void {
    if (this.destroyed || this.creating) return;
    const snapshot = { ...this.draft };
    this.createError = ''; this.createMessage = '';
    if (!snapshot.templateCode.trim() || !snapshot.templateName.trim()) {
      this.createError = 'Enter a template code and name.'; this.cdr.markForCheck(); return;
    }
    this.creating = true;
    this.cdr.markForCheck();
    this.svc
      .createTemplate({
        templateCode: snapshot.templateCode.trim(),
        templateName: snapshot.templateName.trim(),
        sections: [],
      })
      .pipe(takeUntil(this.destroy$), finalize(() => {
        if (!this.destroyed) { this.creating = false; this.cdr.markForCheck(); }
      }))
      .subscribe({
        next: () => {
          if (this.destroyed) return;
          const unchanged = this.draft.templateCode === snapshot.templateCode && this.draft.templateName === snapshot.templateName;
          if (unchanged) { this.showCreate = false; this.draft = { templateCode: '', templateName: '' }; }
          this.createMessage = unchanged ? 'Template created.' : 'Template created. Your newer form edits have been kept.';
          this.reload();
        },
        error: () => { if (!this.destroyed) { this.createError = 'Template creation failed. Your entries have been kept; retry when ready.'; this.cdr.markForCheck(); } },
      });
  }
  ngOnDestroy(): void { this.destroyed = true; this.destroy$.next(); this.destroy$.complete(); }
}
