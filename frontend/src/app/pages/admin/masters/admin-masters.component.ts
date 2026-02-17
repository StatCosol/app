import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { AdminMastersService } from '../../../core/admin-masters.service';
import { PageHeaderComponent, FormInputComponent, FormSelectComponent, SelectOption, ActionButtonComponent, DataTableComponent, TableColumn, TableCellDirective, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-admin-masters',
  imports: [CommonModule, FormsModule, PageHeaderComponent, FormInputComponent, FormSelectComponent, ActionButtonComponent, DataTableComponent, TableCellDirective, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-masters.component.html',
  styleUrls: ['./admin-masters.component.scss'],
})
export class AdminMastersComponent implements OnInit {
  activeTab: 'compliance' | 'audit' = 'compliance';
  loading = false;
  saving = false;
  deletingId: string | null = null;

  // Compliance Masters
  complianceMasters: any[] = [];
  complianceForm: any = this.resetComplianceForm();
  editingComplianceId: string | null = null;

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

  constructor(private api: AdminMastersService, private cdr: ChangeDetectorRef) {
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
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.complianceMasters = res || [];
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
      this.api.updateComplianceMaster(this.editingComplianceId, this.complianceForm).subscribe({
        next: () => {
          this.saving = false;
          this.cancelComplianceEdit();
          this.cdr.detectChanges();
          this.loadComplianceMasters();
        },
        error: () => { this.saving = false; this.cdr.detectChanges(); },
      });
    } else {
      this.api.createComplianceMaster(this.complianceForm).subscribe({
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

  deleteCompliance(id: string) {
    if (this.deletingId) return;
    if (!confirm('Are you sure you want to delete this compliance master?')) return;
    this.deletingId = id;
    this.api.deleteComplianceMaster(id).subscribe({
      next: () => { this.deletingId = null; this.cdr.detectChanges(); this.loadComplianceMasters(); },
      error: () => { this.deletingId = null; this.cdr.detectChanges(); },
    });
  }

  // ============ Audit Categories ============
  loadAuditCategories() {
    this.loading = true;
    this.api.listAuditCategories().pipe(
      timeout(10000),
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
      this.api.updateAuditCategory(this.editingAuditCategoryId, this.auditCategoryForm).subscribe({
        next: () => {
          this.saving = false;
          this.cancelAuditCategoryEdit();
          this.cdr.detectChanges();
          this.loadAuditCategories();
        },
        error: () => { this.saving = false; this.cdr.detectChanges(); },
      });
    } else {
      this.api.createAuditCategory(this.auditCategoryForm).subscribe({
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

  deleteAuditCategory(id: string) {
    if (this.deletingId) return;
    if (!confirm('Are you sure you want to delete this audit category?')) return;
    this.deletingId = id;
    this.api.deleteAuditCategory(id).subscribe({
      next: () => { this.deletingId = null; this.cdr.detectChanges(); this.loadAuditCategories(); },
      error: () => { this.deletingId = null; this.cdr.detectChanges(); },
    });
  }
}
