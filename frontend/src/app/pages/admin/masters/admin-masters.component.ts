import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { AdminMastersService } from '../../../core/admin-masters.service';
import { ReportsService } from '../../../core/reports.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { PageHeaderComponent, FormInputComponent, FormSelectComponent, SelectOption, ActionButtonComponent, DataTableComponent, TableColumn, TableCellDirective, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-admin-masters',
  imports: [CommonModule, FormsModule, PageHeaderComponent, FormInputComponent, FormSelectComponent, ActionButtonComponent, DataTableComponent, TableCellDirective, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-masters.component.html',
  styleUrls: ['./admin-masters.component.scss'],
})
export class AdminMastersComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  activeTab: 'compliance' | 'audit' = 'compliance';
  loading = true;
  saving = false;
  deletingId: string | null = null;

  // Compliance Masters
  complianceMasters: any[] = [];
  filteredComplianceMasters: any[] = [];
  searchTerm = '';
  stateFilter = '';
  complianceForm: any = this.resetComplianceForm();
  editingComplianceId: string | null = null;

  stateFilterOptions = [
    { value: '', label: 'All States' },
    { value: 'ALL', label: 'Central' },
    { value: 'AP', label: 'Andhra Pradesh' },
    { value: 'KA', label: 'Karnataka' },
    { value: 'MH', label: 'Maharashtra' },
    { value: 'TN', label: 'Tamil Nadu' },
    { value: 'TS', label: 'Telangana' },
    { value: 'DL', label: 'Delhi' },
    { value: 'GJ', label: 'Gujarat' },
    { value: 'RJ', label: 'Rajasthan' },
    { value: 'WB', label: 'West Bengal' },
    { value: 'UP', label: 'Uttar Pradesh' },
    { value: 'KL', label: 'Kerala' },
  ];

  // Audit Categories
  auditCategories: any[] = [];
  auditCategoryForm: any = { name: '', description: '' };
  editingAuditCategoryId: string | null = null;

  frequencyOptions = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'EVENT_BASED'];
  frequencySelectOptions: SelectOption[] = [];
  statusSelectOptions: SelectOption[] = [];

  complianceColumns: TableColumn[] = [
    { key: 'complianceName', header: 'Compliance Name', sortable: false },
    { key: 'lawName', header: 'Law Name', sortable: false },
    { key: 'lawFamily', header: 'Law Family', sortable: false },
    { key: 'frequency', header: 'Frequency', sortable: false },
    { key: 'stateScope', header: 'State', sortable: false },
    { key: 'headcount', header: 'Headcount', sortable: false },
    { key: 'isActive', header: 'Status', sortable: false },
    { key: 'actions', header: 'Actions', sortable: false },
  ];

  auditCategoryColumns: TableColumn[] = [
    { key: 'name', header: 'Category Name', sortable: false },
    { key: 'description', header: 'Description', sortable: false },
    { key: 'createdAt', header: 'Created', sortable: false },
    { key: 'actions', header: 'Actions', sortable: false },
  ];

  constructor(private api: AdminMastersService, private cdr: ChangeDetectorRef, private dialog: ConfirmDialogService) {
    // Memoize select option arrays to avoid recreating them every change detection cycle
    this.frequencySelectOptions = this.frequencyOptions.map(freq => ({ value: freq, label: freq }));
    this.statusSelectOptions = [
      { value: true, label: 'Active' },
      { value: false, label: 'Inactive' },
    ];
  }

  ngOnInit() {
    this.loadData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData() {
    if (this.activeTab === 'compliance') {
      this.loadComplianceMasters();
    } else {
      this.loadAuditCategories();
    }
  }

  // ============ Compliance Masters ============
  loadComplianceMasters() {
    this.loading = true;
    this.api.listComplianceMasters().pipe(
      timeout(10000),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.complianceMasters = res || [];
        this.applyFilters();
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }

  resetComplianceForm() {
    return {
      complianceName: '',
      lawName: '',
      lawFamily: '',
      stateScope: '',
      minHeadcount: null,
      maxHeadcount: null,
      frequency: 'MONTHLY',
      description: '',
      isActive: true,
    };
  }

  editCompliance(master: any) {
    this.editingComplianceId = master.id;
    this.complianceForm = { ...master };
  }

  cancelComplianceEdit() {
    this.editingComplianceId = null;
    this.complianceForm = this.resetComplianceForm();
  }

  saveCompliance() {
    if (this.saving) return;
    if (!this.complianceForm.complianceName || !this.complianceForm.lawName) return;
    this.saving = true;

    if (this.editingComplianceId) {
      this.api.updateComplianceMaster(this.editingComplianceId, this.complianceForm).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.cancelComplianceEdit();
          this.cdr.detectChanges();
          this.loadComplianceMasters();
        },
        error: () => { this.saving = false; this.cdr.detectChanges(); },
      });
    } else {
      this.api.createComplianceMaster(this.complianceForm).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.cancelComplianceEdit();
          this.cdr.detectChanges();
          this.loadComplianceMasters();
        },
        error: () => { this.saving = false; this.cdr.detectChanges(); },
      });
    }
  }

  async deleteCompliance(id: string) {
    if (this.deletingId) return;
    if (!(await this.dialog.confirm('Delete Compliance Master', 'Are you sure you want to delete this compliance master?', { variant: 'danger', confirmText: 'Delete' }))) return;
    this.deletingId = id;
    this.api.deleteComplianceMaster(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.deletingId = null; this.cdr.detectChanges(); this.loadComplianceMasters(); },
      error: () => { this.deletingId = null; this.cdr.detectChanges(); },
    });
  }

  // ============ Audit Categories ============
  loadAuditCategories() {
    this.loading = true;
    this.api.listAuditCategories().pipe(
      timeout(10000),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.auditCategories = res || [];
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }

  editAuditCategory(category: any) {
    this.editingAuditCategoryId = category.id;
    this.auditCategoryForm = { ...category };
  }

  cancelAuditCategoryEdit() {
    this.editingAuditCategoryId = null;
    this.auditCategoryForm = { name: '', description: '' };
  }

  saveAuditCategory() {
    if (this.saving) return;
    if (!this.auditCategoryForm.name) return;
    this.saving = true;

    if (this.editingAuditCategoryId) {
      this.api.updateAuditCategory(this.editingAuditCategoryId, this.auditCategoryForm).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.cancelAuditCategoryEdit();
          this.cdr.detectChanges();
          this.loadAuditCategories();
        },
        error: () => { this.saving = false; this.cdr.detectChanges(); },
      });
    } else {
      this.api.createAuditCategory(this.auditCategoryForm).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.cancelAuditCategoryEdit();
          this.cdr.detectChanges();
          this.loadAuditCategories();
        },
        error: () => { this.saving = false; this.cdr.detectChanges(); },
      });
    }
  }

  applyFilters(): void {
    let items = [...this.complianceMasters];
    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase();
      items = items.filter(m =>
        (m.complianceName || '').toLowerCase().includes(q) ||
        (m.lawName || '').toLowerCase().includes(q) ||
        (m.lawFamily || '').toLowerCase().includes(q) ||
        (m.stateScope || '').toLowerCase().includes(q)
      );
    }
    if (this.stateFilter) {
      items = items.filter(m => (m.stateScope || 'ALL').toUpperCase().includes(this.stateFilter));
    }
    this.filteredComplianceMasters = items;
  }

  exportCsv(): void {
    if (this.activeTab === 'compliance') {
      ReportsService.exportCsv(this.filteredComplianceMasters, [
        { key: 'name', label: 'Name' },
        { key: 'act', label: 'Act' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'stateScope', label: 'State' },
      ], 'compliance-masters.csv');
    } else {
      ReportsService.exportCsv(this.auditCategories, [
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description' },
      ], 'audit-categories.csv');
    }
  }

  async deleteAuditCategory(id: string) {
    if (this.deletingId) return;
    if (!(await this.dialog.confirm('Delete Audit Category', 'Are you sure you want to delete this audit category?', { variant: 'danger', confirmText: 'Delete' }))) return;
    this.deletingId = id;
    this.api.deleteAuditCategory(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.deletingId = null; this.cdr.detectChanges(); this.loadAuditCategories(); },
      error: () => { this.deletingId = null; this.cdr.detectChanges(); },
    });
  }
}
