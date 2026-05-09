import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientMasterDataService, MasterItem } from './client-master-data.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  FormInputComponent,
  ModalComponent,
} from '../../../shared/ui';

type MasterTab = 'departments' | 'grades' | 'designations';

@Component({
  selector: 'app-client-master-data',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    FormInputComponent,
    ModalComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Master Data"
        description="Manage departments, grades, and designations"
        icon="collection">
      </ui-page-header>

      <!-- Tabs -->
      <div class="tab-bar">
        <button class="tab-btn" [class.active]="activeTab === 'departments'" (click)="switchTab('departments')">Departments</button>
        <button class="tab-btn" [class.active]="activeTab === 'grades'" (click)="switchTab('grades')">Grades</button>
        <button class="tab-btn" [class.active]="activeTab === 'designations'" (click)="switchTab('designations')">Designations</button>
      </div>

      <!-- Action Bar -->
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm text-gray-500">{{ items.length }} {{ activeTab }}</span>
        <ui-button variant="primary" (clicked)="openForm()">+ Add {{ tabLabel }}</ui-button>
      </div>

      <ui-loading-spinner *ngIf="loading" [text]="'Loading ' + activeTab + '...'" size="lg"></ui-loading-spinner>

      <ui-empty-state
        *ngIf="!loading && items.length === 0"
        [title]="'No ' + tabLabel + 's'"
        [description]="'Click + Add ' + tabLabel + ' to create one.'">
      </ui-empty-state>

      <!-- Table -->
      <div *ngIf="!loading && items.length > 0" class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 font-semibold text-gray-700">Code</th>
              <th class="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th class="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
              <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of items" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-gray-900">{{ item.code }}</td>
              <td class="px-4 py-3 text-gray-900">{{ item.name }}</td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                  [class.bg-green-100]="item.isActive" [class.text-green-700]="item.isActive"
                  [class.bg-gray-100]="!item.isActive" [class.text-gray-500]="!item.isActive">
                  {{ item.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button class="text-xs text-blue-600 hover:underline" (click)="editItem(item)">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add/Edit Modal -->
      <ui-modal *ngIf="showModal" [title]="editingItem ? 'Edit ' + tabLabel : 'Add ' + tabLabel" (closed)="showModal = false">
        <div class="grid grid-cols-1 gap-4">
          <ui-form-input label="Code *" [(ngModel)]="form.code" placeholder="e.g. HR, IT, FIN"></ui-form-input>
          <ui-form-input label="Name *" [(ngModel)]="form.name" placeholder="e.g. Human Resources"></ui-form-input>
          <label *ngIf="editingItem" class="flex items-center gap-2 text-sm">
            <input autocomplete="off" id="cmd-is-active" name="isActive" type="checkbox" [(ngModel)]="form.isActive"> Active
          </label>
        </div>
        <div *ngIf="formError" class="text-sm text-red-600 mt-2">{{ formError }}</div>
        <div class="flex justify-end gap-3 mt-4">
          <ui-button variant="secondary" (clicked)="showModal = false">Cancel</ui-button>
          <ui-button variant="primary" [disabled]="saving" [loading]="saving" (clicked)="save()">
            {{ editingItem ? 'Update' : 'Create' }}
          </ui-button>
        </div>
      </ui-modal>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1rem; }
    .tab-bar { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 1.25rem; }
    .tab-btn {
      padding: 0.6rem 1.25rem; font-size: 0.875rem; font-weight: 500; color: #6b7280;
      border-bottom: 2px solid transparent; cursor: pointer; margin-bottom: -2px;
      background: none; border-top: none; border-left: none; border-right: none;
      transition: color 0.2s, border-color 0.2s;
    }
    .tab-btn:hover { color: #374151; }
    .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }
  `],
})
export class ClientMasterDataComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  activeTab: MasterTab = 'departments';
  items: MasterItem[] = [];
  loading = false;
  showModal = false;
  editingItem: MasterItem | null = null;
  saving = false;
  formError = '';
  form: any = { code: '', name: '', isActive: true };

  get tabLabel(): string {
    return this.activeTab === 'departments' ? 'Department' : this.activeTab === 'grades' ? 'Grade' : 'Designation';
  }

  constructor(private svc: ClientMasterDataService, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  switchTab(tab: MasterTab) {
    this.activeTab = tab;
    this.load();
  }

  load() {
    this.loading = true;
    const obs = this.activeTab === 'departments' ? this.svc.listDepartments()
      : this.activeTab === 'grades' ? this.svc.listGrades()
      : this.svc.listDesignations();

    obs.pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (list) => { this.items = list; },
        error: () => { this.items = []; },
      });
  }

  openForm() {
    this.editingItem = null;
    this.form = { code: '', name: '', isActive: true };
    this.formError = '';
    this.showModal = true;
  }

  editItem(item: MasterItem) {
    this.editingItem = item;
    this.form = { code: item.code, name: item.name, isActive: item.isActive };
    this.formError = '';
    this.showModal = true;
  }

  save() {
    if (!this.form.code?.trim() || !this.form.name?.trim()) {
      this.formError = 'Code and Name are required';
      return;
    }
    this.saving = true;
    this.formError = '';

    const obs = this.editingItem
      ? (this.activeTab === 'departments' ? this.svc.updateDepartment(this.editingItem.id, this.form)
        : this.activeTab === 'grades' ? this.svc.updateGrade(this.editingItem.id, this.form)
        : this.svc.updateDesignation(this.editingItem.id, this.form))
      : (this.activeTab === 'departments' ? this.svc.createDepartment(this.form)
        : this.activeTab === 'grades' ? this.svc.createGrade(this.form)
        : this.svc.createDesignation(this.form));

    obs.pipe(takeUntil(this.destroy$), finalize(() => { this.saving = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.success(this.editingItem ? `${this.tabLabel} updated` : `${this.tabLabel} created`);
          this.showModal = false;
          this.load();
        },
        error: (e) => { this.formError = e?.error?.message || 'Failed to save'; },
      });
  }
}
