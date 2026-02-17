import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { ClientAuditsService } from '../../../core/client-audits.service';
import { PageHeaderComponent, DataTableComponent, TableColumn, FormSelectComponent, StatusBadgeComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-audits',
  imports: [CommonModule, FormsModule, PageHeaderComponent, DataTableComponent, FormSelectComponent, StatusBadgeComponent],
  templateUrl: './client-audits.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-audits.component.scss'],
})
export class ClientAuditsComponent {
  loading = false;
  audits: any[] = [];

  filters = {
    year: new Date().getFullYear(),
    status: '',
    frequency: '',
  };

  columns: TableColumn[] = [
    { key: 'auditType', header: 'Audit Type', sortable: true },
    { key: 'frequency', header: 'Frequency', sortable: true },
    { key: 'period', header: 'Period', sortable: false },
    { key: 'auditor', header: 'Auditor', sortable: false },
    { key: 'contractor', header: 'Contractor', sortable: false },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'notes', header: 'Notes', sortable: false },
  ];

  constructor(private api: ClientAuditsService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadAudits();
  }

  loadAudits() {
    this.loading = true;
    this.api.list(this.filters).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.audits = res || [];
        // Transform data for table display
        this.audits = this.audits.map(audit => ({
          ...audit,
          period: `${audit.periodCode} / ${audit.periodYear}`,
          auditor: audit.assignedAuditor?.name || '\u2014',
          contractor: audit.contractorUser?.name || 'All',
          dueDate: this.formatDate(audit.dueDate),
          notes: audit.notes || '\u2014'
        }));
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }

  getStatusClass(status: string): string {
    const map: any = {
      PLANNED: 'planned',
      IN_PROGRESS: 'in-progress',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    };
    return map[status] || 'planned';
  }

  formatDate(date: string | Date): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  }

  get auditCounts() {
    return {
      total: this.audits.length,
      planned: this.audits.filter(a => a.status === 'PLANNED').length,
      inProgress: this.audits.filter(a => a.status === 'IN_PROGRESS').length,
      completed: this.audits.filter(a => a.status === 'COMPLETED').length,
    };
  }
}
