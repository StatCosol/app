import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalTemplate } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-client-appraisal-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../shared/client-theme.scss', './client-appraisal-theme.scss'],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Appraisal Templates</h1>
          <p class="page-subtitle">Manage rating templates used in appraisal cycles</p>
        </div>
        <div class="page-actions">
          <a routerLink="/client/appraisal-cycles" class="appraisal-action">Cycles</a>
          <button type="button" class="appraisal-action appraisal-action--primary" (click)="showCreate = !showCreate">
            {{ showCreate ? 'Cancel' : 'New Template' }}
          </button>
        </div>
      </div>

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
          <button type="button" class="appraisal-action appraisal-action--primary mt-4" [disabled]="creating" (click)="createTemplate()">
            {{ creating ? 'Saving...' : 'Create Template' }}
          </button>
        </div>
      }

      @if (loading) {
        <div class="flex items-center justify-center py-20"><div class="spinner"></div></div>
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
export class ClientAppraisalTemplatesComponent implements OnInit {
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
    this.loading = true;
    this.cdr.markForCheck();
    this.svc
      .getTemplates()
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (rows) => {
          this.templates = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.templates = [];
          this.cdr.markForCheck();
        },
      });
  }

  createTemplate(): void {
    if (!this.draft.templateCode.trim() || !this.draft.templateName.trim()) return;
    this.creating = true;
    this.cdr.markForCheck();
    this.svc
      .createTemplate({
        templateCode: this.draft.templateCode.trim(),
        templateName: this.draft.templateName.trim(),
        sections: [],
      })
      .pipe(finalize(() => {
        this.creating = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.showCreate = false;
          this.draft = { templateCode: '', templateName: '' };
          this.reload();
        },
      });
  }
}
