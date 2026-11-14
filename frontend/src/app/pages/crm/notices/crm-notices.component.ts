import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of, finalize, catchError, takeUntil, timeout } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/ui/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import {
  NoticesService,
  Notice,
  NoticeKpis,
} from '../../../core/notices.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';

@Component({
  standalone: true,
  selector: 'app-crm-notices',
  imports: [IconComponent,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './crm-notices.component.html',
  styleUrls: ['./crm-notices.component.scss'],
})
export class CrmNoticesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private listRequest?: Subscription;
  private kpiRequest?: Subscription;
  private detailRequest?: Subscription;
  private listVersion = 0;
  private detailVersion = 0;
  requestedNotice: Notice | null = null;
  detailLoading = false;
  detailError = '';
  listError = '';
  kpiError = '';

  loading = false;
  saving = false;
  notices: Notice[] = [];
  filtered: Notice[] = [];
  kpis: NoticeKpis | null = null;
  selected: Notice | null = null;

  // Filters
  search = '';
  statusFilter = '';
  severityFilter = '';
  typeFilter = '';
  clientFilter = '';

  // Clients list for filter dropdown
  clients: { id: string; clientName: string }[] = [];

  // Create form
  showCreate = false;
  newNotice: any = {};

  readonly statuses = ['RECEIVED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'RESPONSE_DRAFTED', 'RESPONSE_SUBMITTED', 'CLOSED', 'ESCALATED'];
  readonly severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  readonly types = ['SHOW_CAUSE', 'DEMAND', 'INSPECTION', 'PENALTY', 'GENERAL', 'PROSECUTION', 'OTHER'];

  constructor(
    private noticesApi: NoticesService,
    private crmClientsApi: CrmClientsApi,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClients() {
    this.crmClientsApi.getAssignedClients().pipe(
      takeUntil(this.destroy$),
      catchError(() => of([])),
    ).subscribe({
      next: (data: any[]) => this.clients = data.map((c: any) => ({ id: c.id, clientName: c.clientName })),
    });
  }

  loadAll(preserveDetail = false) {
    const version = ++this.listVersion;
    this.listRequest?.unsubscribe();
    this.kpiRequest?.unsubscribe();
    if (!preserveDetail) this.closeDetail();
    this.notices = [];
    this.filtered = [];
    this.kpis = null;
    this.listError = '';
    this.kpiError = '';
    this.loading = true;
    const filters: any = {};
    if (this.clientFilter) filters.clientId = this.clientFilter;
    if (this.statusFilter) filters.status = this.statusFilter;
    if (this.severityFilter) filters.severity = this.severityFilter;
    if (this.typeFilter) filters.noticeType = this.typeFilter;
    if (this.search) filters.search = this.search;

    this.listRequest = this.noticesApi.crmList(filters).pipe(
      takeUntil(this.destroy$),
      timeout(15000),
      finalize(() => { if (version === this.listVersion) this.loading = false; }),
    ).subscribe({
      next: (data) => {
        if (version !== this.listVersion) return;
        this.notices = data || [];
        this.filtered = data || [];
        if (this.requestedNotice && !this.filtered.some(row => row.id === this.requestedNotice?.id)) this.closeDetail();
      },
      error: () => { if (version === this.listVersion) this.listError = 'Notices could not be loaded. Retry to refresh this list.'; },
    });

    this.kpiRequest = this.noticesApi.crmKpis(this.clientFilter || undefined).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: (k) => { if (version === this.listVersion) this.kpis = k; },
      error: () => { if (version === this.listVersion) this.kpiError = 'Notice totals are unavailable. Retry to refresh them.'; },
    });
  }

  applyFilters() {
    this.loadAll();
  }

  selectNotice(n: Notice) {
    const version = ++this.detailVersion;
    this.detailRequest?.unsubscribe();
    this.requestedNotice = n;
    this.selected = null;
    this.detailError = '';
    this.detailLoading = true;
    this.detailRequest = this.noticesApi.crmGetOne(n.id).pipe(
      takeUntil(this.destroy$), timeout(15000),
      finalize(() => { if (version === this.detailVersion) this.detailLoading = false; }),
    ).subscribe({
      next: detail => {
        if (version !== this.detailVersion || this.requestedNotice?.id !== n.id) return;
        if (detail?.id === n.id) this.selected = detail;
        else this.detailError = 'Notice details could not be loaded. Retry to refresh this notice.';
      },
      error: () => { if (version === this.detailVersion) this.detailError = 'Notice details could not be loaded. Retry to refresh this notice.'; },
    });
  }

  closeDetail() {
    this.detailVersion++;
    this.detailRequest?.unsubscribe();
    this.requestedNotice = null;
    this.selected = null;
    this.detailLoading = false;
    this.detailError = '';
  }

  retryDetail() {
    if (this.requestedNotice) this.selectNotice(this.requestedNotice);
  }

  toggleCreate() {
    this.showCreate = !this.showCreate;
    if (this.showCreate) {
      this.newNotice = {
        clientId: this.clientFilter || '',
        branchId: '',
        noticeType: 'GENERAL',
        departmentName: '',
        referenceNo: '',
        subject: '',
        description: '',
        noticeDate: new Date().toISOString().slice(0, 10),
        receivedDate: new Date().toISOString().slice(0, 10),
        responseDueDate: '',
        severity: 'MEDIUM',
      };
    }
  }

  saveNotice() {
    if (!this.newNotice.clientId || !this.newNotice.subject || !this.newNotice.departmentName) return;
    this.saving = true;
    this.noticesApi.crmCreate(this.newNotice).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.saving = false),
    ).subscribe({
      next: () => {
        this.showCreate = false;
        this.loadAll();
      },
    });
  }

  updateStatus(notice: Notice, newStatus: string, remarks?: string) {
    const scopeVersion = this.listVersion;
    const selectionVersion = this.detailVersion;
    this.noticesApi.crmUpdate(notice.id, { status: newStatus, remarks }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        if (scopeVersion !== this.listVersion) return;
        const refreshSelection = this.requestedNotice?.id === notice.id && selectionVersion === this.detailVersion;
        this.loadAll(true);
        if (refreshSelection) this.selectNotice(notice);
      },
    });
  }

  severityColor(s: string): string {
    switch (s) {
      case 'CRITICAL': return 'text-red-700 bg-red-50 border-red-200';
      case 'HIGH': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'MEDIUM': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default: return 'text-green-700 bg-green-50 border-green-200';
    }
  }

  statusColor(s: string): string {
    switch (s) {
      case 'CLOSED': return 'text-green-700 bg-green-50';
      case 'ESCALATED': return 'text-red-700 bg-red-50';
      case 'ACTION_REQUIRED': return 'text-orange-700 bg-orange-50';
      case 'RESPONSE_SUBMITTED': return 'text-brand-700 bg-brand-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  }

  isOverdue(n: Notice): boolean {
    if (!n.responseDueDate || n.status === 'CLOSED') return false;
    return n.responseDueDate < new Date().toISOString().slice(0, 10);
  }

  trackById(_: number, item: any) { return item.id; }
}
