import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardSummaryDto } from './admin-dashboard.dto';
import {
  PageHeaderComponent,
  StatCardComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  EmptyStateComponent,
  FormSelectComponent,
  TableColumn,
  SelectOption
} from '../../../shared/ui';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    EmptyStateComponent,
    FormSelectComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit {
  summary: AdminDashboardSummaryDto | null = null;
  loading = false;
  statesLoading = false;
  filter = {
    client: 'all',
    state: 'all',
    from: '',
    to: ''
  };
  clients: Array<{ id: string; name: string }> = [];
  states: string[] = [];

  get clientOptions(): SelectOption[] {
    return [
      { value: 'all', label: 'All Clients' },
      ...this.clients.map(c => ({ value: c.id, label: c.name }))
    ];
  }

  get stateOptions(): SelectOption[] {
    return [
      { value: 'all', label: 'All States' },
      ...this.states.map(s => ({ value: s, label: s }))
    ];
  }

  constructor(
    private dashboard: AdminDashboardService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  // Table columns for escalations
  escalationsColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'issueType', header: 'Issue Type' },
    { key: 'reason', header: 'Reason' },
    { key: 'ownerRole', header: 'Owner Role' },
    { key: 'ownerName', header: 'Owner' },
    { key: 'daysDelayed', header: 'Days Delayed' },
    { key: 'lastUpdated', header: 'Last Updated' },
    { key: 'actions', header: 'Actions', align: 'right' }
  ];

  // Table columns for assignments
  assignmentsColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'assignmentType', header: 'Role' },
    { key: 'assignedTo', header: 'Assigned To' },
    { key: 'assignedOn', header: 'Assigned On' },
    { key: 'rotationDueOn', header: 'Rotation Due' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions', align: 'right' }
  ];

  ngOnInit(): void {
    this.loadClients();
    this.loadStates();
    this.loadSummary();
  }

  loadSummary() {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.filter.client !== 'all') params['clientId'] = this.filter.client;
    if (this.filter.state !== 'all') params['stateCode'] = this.filter.state;
    if (this.filter.from) params['fromDate'] = this.filter.from;
    if (this.filter.to) params['toDate'] = this.filter.to;

    this.dashboard.getSummary(params).subscribe({
      next: (data) => {
        this.summary = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); }
    });
  }

  loadClients() {
    this.dashboard.getClientsMinimal().subscribe(list => { this.clients = list; this.cdr.detectChanges(); });
  }

  loadStates() {
    this.statesLoading = true;
    this.dashboard.getAvailableStates().subscribe({
      next: (data) => {
        this.states = data || [];
        this.statesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.states = [];
        this.statesLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilters() {
    this.loadSummary();
  }

  resetFilters() {
    this.filter = { client: 'all', state: 'all', from: '', to: '' };
    this.loadSummary();
  }

  // KPI Card Drill-down Handlers
  drillOverdueAudits() {
    this.router.navigate(['/admin/escalations'], {
      queryParams: { issueType: 'AUDIT', reason: 'OVERDUE' }
    });
  }

  drillDueSoon() {
    this.router.navigate(['/admin/escalations'], {
      queryParams: { issueType: 'AUDIT', reason: 'DUE_SOON', window: 30 }
    });
  }

  drillUnreadNotifications() {
    this.router.navigate(['/admin/notifications'], {
      queryParams: { status: 'UNREAD' }
    });
  }

  drillAssignments() {
    this.router.navigate(['/admin/assignments'], {
      queryParams: { tab: 'NEEDS_ATTENTION' }
    });
  }

  drillSystemHealth() {
    this.router.navigate(['/admin/system-health']);
  }
}
