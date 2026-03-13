import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize } from 'rxjs';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';

type StatusTab = 'ALL' | 'OPEN' | 'SUBMITTED' | 'REJECTED' | 'REVERIFIED';

interface ReuploadRow {
  id: string;
  documentId: string;
  documentType: string;
  clientId: string;
  clientName: string;
  unitId: string;
  unitName: string;
  targetRole: string;
  requestedByRole: string;
  reason: string;
  status: string;
  deadlineDate: string | null;
  submittedAt: string | null;
  reverifiedAt: string | null;
  crmRemarks: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-crm-reupload-backlog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent, LoadingSpinnerComponent],
  templateUrl: './crm-reupload-backlog.component.html',
})
export class CrmReuploadBacklogComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /* ── State ── */
  loading = false;
  items: ReuploadRow[] = [];
  total = 0;
  page = 1;
  limit = 25;

  /* ── Filters ── */
  statusTab: StatusTab = 'ALL';
  targetRoleFilter = '';
  searchQuery = '';
  overdue = false;
  dueSoon = false;
  slaDays = 2;
  private searchDebounce: any;

  /* ── KPI counts (from backlog endpoint) ── */
  kpi: { open: number; submitted: number; rejected: number } = { open: 0, submitted: 0, rejected: 0 };

  /* ── Top overdue units ── */
  topUnits: any[] = [];

  constructor(
    private complianceApi: ComplianceApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // Read query params for pre-selected status tab
    const qp = this.route.snapshot.queryParams;
    if (qp['status'] && this.tabs.includes(qp['status'] as StatusTab)) {
      this.statusTab = qp['status'] as StatusTab;
    }
    this.loadKpis();
    this.loadTopUnits();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  /* ── Tabs ── */
  readonly tabs: StatusTab[] = ['ALL', 'OPEN', 'SUBMITTED', 'REJECTED', 'REVERIFIED'];

  tabLabel(tab: StatusTab): string {
    const counts: Record<StatusTab, number | null> = {
      ALL: this.kpi.open + this.kpi.submitted + this.kpi.rejected,
      OPEN: this.kpi.open,
      SUBMITTED: this.kpi.submitted,
      REJECTED: this.kpi.rejected,
      REVERIFIED: null,
    };
    const c = counts[tab];
    return c != null && c > 0 ? `${tab} (${c})` : tab;
  }

  selectTab(tab: StatusTab): void {
    this.statusTab = tab;
    this.page = 1;
    this.load();
  }

  /* ── Search ── */
  onSearch(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 350);
  }

  /* ── Target role filter ── */
  onTargetRoleChange(): void {
    this.page = 1;
    this.load();
  }

  /* ── Pagination ── */
  get maxPage(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  goPage(p: number): void {
    if (p < 1 || p > this.maxPage) return;
    this.page = p;
    this.load();
  }

  /* ── Data loading ── */
  load(): void {
    this.loading = true;
    const query: any = { page: this.page, limit: this.limit };
    if (this.statusTab !== 'ALL') query.status = this.statusTab;
    if (this.targetRoleFilter) query.targetRole = this.targetRoleFilter;
    if (this.searchQuery.trim()) query.q = this.searchQuery.trim();
    if (this.overdue) query.overdue = true;
    if (this.dueSoon) query.dueSoon = true;
    query.slaDays = this.slaDays;

    this.complianceApi.crmListReuploadRequests(query)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => {
          this.items = res.items || [];
          this.total = res.total || 0;
          this.page = res.page || 1;
        },
        error: () => this.toast.error('Failed to load reupload requests'),
      });
  }

  loadKpis(): void {
    this.complianceApi.crmGetReuploadBacklog()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.kpi = { open: res.open || 0, submitted: res.submitted || 0, rejected: res.rejected || 0 };
          this.cdr.detectChanges();
        },
      });
  }

  loadTopUnits(): void {
    this.complianceApi.crmTopOverdueReuploadUnits({ slaDays: this.slaDays })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.topUnits = Array.isArray(res) ? res : [];
          this.cdr.detectChanges();
        },
        error: () => this.toast.error('Failed to load top overdue units'),
      });
  }

  onSlaChange(): void {
    this.page = 1;
    this.loadTopUnits();
    this.load();
  }

  onOverdueToggle(): void {
    if (this.overdue) this.dueSoon = false;
    this.page = 1;
    this.load();
  }

  onDueSoonToggle(): void {
    if (this.dueSoon) this.overdue = false;
    this.page = 1;
    this.load();
  }

  /* ── Helpers ── */
  statusBadgeClass(status: string): string {
    switch (status) {
      case 'OPEN': return 'bg-blue-100 text-blue-800';
      case 'SUBMITTED': return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'REVERIFIED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  roleBadgeClass(role: string): string {
    switch (role) {
      case 'CONTRACTOR': return 'bg-purple-100 text-purple-700';
      case 'CLIENT': return 'bg-teal-100 text-teal-700';
      case 'BRANCH': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  isOverdue(row: ReuploadRow): boolean {
    if (!row.deadlineDate || row.status === 'REVERIFIED') return false;
    return new Date(row.deadlineDate) < new Date();
  }

  deepLink(row: ReuploadRow): void {
    switch (row.targetRole) {
      case 'CLIENT':
        this.router.navigate(['/crm/clients', row.clientId, 'compliance-tracker'], {
          queryParams: { tab: 'DOCS', docId: row.documentId },
        });
        break;
      case 'BRANCH':
        this.router.navigate(['/crm/clients', row.clientId, 'compliance-tracker'], {
          queryParams: { tab: 'DOCS', branchId: row.unitId, docId: row.documentId },
        });
        break;
      case 'CONTRACTOR':
        this.router.navigate(['/crm/clients', row.clientId, 'compliance-tracker'], {
          queryParams: { tab: 'DOCS', docId: row.documentId },
        });
        break;
    }
  }
}
