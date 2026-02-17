import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { timeout, finalize } from 'rxjs/operators';
import { DashboardService } from '../../core/dashboard.service';
import { 
  PageHeaderComponent, 
  StatCardComponent, 
  DataTableComponent, 
  TableCellDirective, 
  TableColumn,
  LoadingSpinnerComponent
} from '../../shared/ui';

@Component({
  selector: 'app-contractor-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    PageHeaderComponent, 
    StatCardComponent, 
    DataTableComponent, 
    TableCellDirective,
    LoadingSpinnerComponent
  ],
  templateUrl: './contractor-dashboard.component.html',
  styleUrls: ['./contractor-dashboard.component.scss'],
})
export class ContractorDashboardComponent implements OnInit {
  data: any = null;
  loading = true;
  errorMsg: string | null = null;

  overdueColumns: TableColumn[] = [
    { key: 'complianceName', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date', width: '150px' }
  ];

  constructor(private dash: DashboardService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.errorMsg = null;
    this.dash.contractor().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (d) => {
        this.data = d || null;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorMsg = err?.error?.message || 'Failed to load dashboard';
        this.cdr.detectChanges();
      },
    });
  }

  get overdueTableData(): any[] {
    if (!this.data?.overdue) return [];
    return this.data.overdue.map((t: any) => ({
      complianceName: t.compliance?.complianceName || '-',
      branchName: t.branch?.branchName || '-',
      dueDate: t.dueDate
    }));
  }
}
