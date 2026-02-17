import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { ComplianceService } from '../../../core/compliance.service';
import { 
  PageHeaderComponent,
  FormSelectComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  ActionButtonComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent
} from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-contractor-tasks',
  imports: [
    CommonModule, 
    RouterModule, 
    FormsModule, 
    PageHeaderComponent,
    FormSelectComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  templateUrl: './contractor-tasks.component.html',
  styleUrls: ['./contractor-tasks.component.scss'],
})
export class ContractorTasksComponent {
  tasks: any[] = [];
  loading = false;

  filters = {
    status: 'ALL',
    branchId: '',
    month: '',
    year: '',
  };

  taskColumns: TableColumn[] = [
    { key: 'complianceTitle', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'dueDate', header: 'Due Date', sortable: true, width: '200px' },
    { key: 'status', header: 'Status', width: '140px' },
    { key: 'evidenceCount', header: 'Evidence', width: '100px', align: 'center' },
    { key: 'actions', header: 'Actions', width: '100px', align: 'right' }
  ];

  statusOptions = [
    { value: 'ALL', label: 'All' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'APPROVED', label: 'Approved' }
  ];

  constructor(private api: ComplianceService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.contractorListTasks(this.filters).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res:any) => { 
        this.tasks = res?.data || res || []; 
        // Transform data for table display
        this.tasks = this.tasks.map((t: any) => ({
          ...t,
          complianceTitle: t.compliance?.title || t.complianceTitle || 'Compliance Task',
          branchName: t.branch?.branchName || '-',
          evidenceCount: t.evidenceCount || 0
        }));
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); }
    });
  }

  openTask(t: any) {
    this.router.navigate(['/contractor/tasks', t.id]);
  }

  dueText(t:any){
    const due = new Date(t.dueDate);
    const today = new Date();
    const diff = Math.ceil((due.getTime()-today.getTime())/(1000*60*60*24));
    if (t.status === 'OVERDUE' || diff < 0) return `Overdue by ${Math.abs(diff)} day(s)`;
    if (diff === 0) return 'Due today';
    return `Due in ${diff} day(s)`;
  }
}
