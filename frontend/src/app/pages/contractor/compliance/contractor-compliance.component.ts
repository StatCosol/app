import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { ComplianceService } from '../../../core/compliance.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { 
  PageHeaderComponent,
  FormInputComponent,
  FormSelectComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  ActionButtonComponent
} from '../../../shared/ui';

@Component({
  selector: 'app-contractor-compliance',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    PageHeaderComponent,
    FormInputComponent,
    FormSelectComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    ActionButtonComponent
  ],
  templateUrl: './contractor-compliance.component.html',
  styleUrls: ['./contractor-compliance.component.scss'],
})
export class ContractorComplianceComponent {
  tasks: any[] = [];
  filters: any = { status: '', year: '', month: '' };

  viewTab: 'MY' | 'SUBMITTED' | 'OVERDUE' = 'MY';

  selectedId?: string;
  uploadFile?: File;
  loading = false;

  taskColumns: TableColumn[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'complianceName', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'dueDate', header: 'Due Date', width: '120px' },
    { key: 'status', header: 'Status', width: '120px' },
    { key: 'evidence', header: 'Evidence', width: '280px' },
    { key: 'actions', header: 'Actions', width: '180px', align: 'right' }
  ];

  statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'OVERDUE', label: 'Overdue' }
  ];

  constructor(private compliance: ComplianceService, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.compliance.contractorListTasks(this.filters).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        const rawTasks = res?.data || [];
        // Transform data for table display
        this.tasks = rawTasks.map((t: any) => ({
          ...t,
          complianceName: t.compliance?.complianceName || t.complianceId,
          branchName: t.branch?.branchName || t.branchId || '-'
        }));
        this.cdr.detectChanges();
      },
      error: () => {
        this.tasks = [];
        this.cdr.detectChanges();
      }
    });
  }

  setTab(tab: 'MY' | 'SUBMITTED' | 'OVERDUE'): void {
    this.viewTab = tab;
    if (tab === 'MY') {
      this.filters.status = '';
    } else if (tab === 'SUBMITTED') {
      this.filters.status = 'SUBMITTED';
    } else {
      this.filters.status = 'OVERDUE';
    }
    this.load();
  }

  start(id: string | number) {
    this.compliance.contractorStart(String(id)).subscribe(() => { this.cdr.detectChanges(); this.load(); });
  }

  submit(id: string | number) {
    this.compliance.contractorSubmit(String(id)).subscribe({
      next: () => { this.cdr.detectChanges(); this.load(); },
      error: (e) => { this.toast.error(e?.error?.message || 'Submit failed'); this.cdr.detectChanges(); },
    });
  }

  pickFile(evt: any, taskId: string | number) {
    const f = evt?.target?.files?.[0];
    if (!f) return;
    this.uploadFile = f;
    this.selectedId = String(taskId);
  }

  upload(taskId: string | number) {
    if (!this.uploadFile) return;
    this.compliance.contractorUploadEvidence(String(taskId), this.uploadFile).subscribe({
      next: () => {
        this.uploadFile = undefined;
        this.selectedId = undefined;
        this.cdr.detectChanges();
        this.load();
      },
      error: (e) => { this.toast.error(e?.error?.message || 'Upload failed'); this.cdr.detectChanges(); },
    });
  }
}
