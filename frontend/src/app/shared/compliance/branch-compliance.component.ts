import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { ComplianceTrendComponent } from './compliance-trend.component';
import { RiskForecastComponent } from './risk-forecast.component';
import { ComplianceSummaryComponent } from './compliance-summary.component';
import { RiskSimulatorComponent } from './risk-simulator.component';

type ModuleType = 'ALL' | 'RETURNS' | 'MCD' | 'REGISTRATION';
type ScheduleSignal = 'UPCOMING' | 'OPEN_WINDOW' | 'DUE_SOON' | 'OVERDUE' | 'SCHEDULED';

@Component({
  standalone: true,
  selector: 'app-branch-compliance',
  imports: [CommonModule, FormsModule, ComplianceTrendComponent, RiskForecastComponent, ComplianceSummaryComponent, RiskSimulatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './branch-compliance.component.html',
  styles: [`
    .page{max-width:1280px;margin:0 auto;}
    .head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
    .title{font-size:18px;font-weight:800;margin:0;color:#0f172a;}
    .sub{margin-top:4px;color:#64748b;font-size:12px;}
    .controls{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;}
    input,select{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff;font-size:13px;}
    .cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:12px 0;}
    .card{background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
    .k{color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
    .v{margin-top:8px;font-size:20px;font-weight:900;color:#0f172a;}
    .tbl{background:#fff;border:1px solid #f1f5f9;border-radius:16px;overflow:hidden;}
    .table-row{cursor:pointer;transition:background .15s ease;}
    .table-row:hover{background:#f8fafc;}
    .table-row--selected{background:#eff6ff;}
    table{width:100%;border-collapse:collapse;}
    th{background:#f8fafc;border-bottom:2px solid #f1f5f9;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:12px 14px;text-align:left;}
    td{border-bottom:1px solid #f8fafc;padding:12px 14px;font-size:13px;color:#0f172a;vertical-align:top;}
    .badge{display:inline-flex;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px;}
    .signal{display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px;border:1px solid transparent;white-space:nowrap;}
    .signal--overdue{background:#fef2f2;color:#b91c1c;border-color:#fecaca;}
    .signal--soon{background:#fff7ed;color:#c2410c;border-color:#fed7aa;}
    .signal--open{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;}
    .signal--upcoming{background:#ecfdf5;color:#047857;border-color:#a7f3d0;}
    .signal--scheduled{background:#f8fafc;color:#475569;border-color:#e2e8f0;}
    .LOW{background:#dcfce7;color:#166534;}
    .MEDIUM{background:#fef3c7;color:#92400e;}
    .HIGH{background:#fee2e2;color:#991b1b;}
    .CRITICAL{background:#fecaca;color:#7f1d1d;outline:2px solid rgba(220,38,38,.35);}
    .INFO{background:#e0f2fe;color:#075985;}
    .btn{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#0f172a;color:#fff;cursor:pointer;font-weight:800;font-size:12px;}
    .btn2{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#fff;color:#0f172a;cursor:pointer;font-weight:800;font-size:12px;}
    .muted{color:#94a3b8;font-size:12px;}
    .error-banner{background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;margin:12px 0;color:#991b1b;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;}
    .detail-panel{margin-top:12px;background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
    .detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;}
    .detail-title{font-size:16px;font-weight:800;color:#0f172a;}
    .detail-sub{margin-top:4px;color:#64748b;font-size:12px;}
    .detail-copy{margin-top:12px;color:#334155;font-size:13px;line-height:1.6;}
    .detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px;}
    .detail-tile{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;}
    .detail-tile-label{display:block;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
    .detail-tile-value{display:block;margin-top:6px;color:#0f172a;font-size:14px;font-weight:700;}
    .detail-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
    @media(max-width:900px){.cards{grid-template-columns:repeat(2,minmax(0,1fr));}.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
  `]
})
export class BranchComplianceComponent implements OnInit {
  month = this.toYYYYMM(new Date());
  module: ModuleType = 'ALL';

  branches: any[] = [];
  branchId = '';
  clientName = '';
  clientCode = '';

  loading = false;
  errorMessage = '';
  stateCode: string | null = null;
  establishmentType: string | null = null;

  items: any[] = [];
  selectedOverviewItem: any | null = null;

  // KPI
  total = 0;
  returnsCount = 0;
  mcdCount = 0;
  highCritical = 0;

  // Upload completion %
  completionPercent = 0;
  uploaded = 0;
  totalApplicableCodes = 0;
  completedCount = 0;
  pendingCount = 0;
  overdueCount = 0;
  dueSoonCount = 0;

  // Risk score
  riskScore = 0;
  riskLevel = 'LOW';
  inspectionProbability = 0;
  riskReasons: string[] = [];

  // Action plan
  actionPlan: any[] = [];
  actionPlanLoading = false;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const user = this.auth.getUser() || {};
    this.clientName = user?.clientName || '';
    this.clientCode = user?.clientCode || '';

    const mapped = this.auth.getBranchIds();
    if (mapped?.length) {
      this.branchId = mapped[0];
      this.branches = mapped.map(id => ({ id, name: 'Branch', branchCode: '', stateCode: '', establishmentType: '' }));
      this.load();
      this.api.list().subscribe({
        next: (b: any[]) => {
          const branchMap = new Map((b || []).map((x: any) => [x.id, this.mapBranchOption(x)]));
          this.branches = mapped.map(id => branchMap.get(id) || { id, name: 'Branch', branchCode: '', stateCode: '', establishmentType: '' });
          this.cdr.markForCheck();
        },
      });
      return;
    }

    // Master/CRM/Client: show all branches
    this.api.list().subscribe({
      next: (b: any[]) => {
        this.branches = (b || []).map((x) => this.mapBranchOption(x));
        this.branchId = this.branches[0]?.id || '';
        if (!this.branchId) {
          this.errorMessage = 'No branches found. Please ensure at least one branch exists.';
        }
        this.cdr.markForCheck();
        this.load();
      },
      error: (err: any) => {
        console.error('[BranchCompliance] Failed to load branches:', err?.message || err?.statusText);
        this.errorMessage = 'Failed to load branches — ' + (err?.error?.message || err?.statusText || 'server error');
        this.cdr.markForCheck();
      }
    });
  }

  load() {
    if (!this.branchId) return;

    this.loading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.api.getBranchComplianceItems(this.branchId, this.month).subscribe({
      next: (res: any) => {
        this.stateCode = res.stateCode ?? null;
        this.establishmentType = res.establishmentType ?? null;

        const all = res.items || [];
        this.items = this.module === 'ALL' ? all : all.filter((x: any) => x.module === this.module);
        this.selectedOverviewItem = this.pickSelectedItem(this.items, this.selectedOverviewItem?.code);

        this.computeKpi(all);
        this.loadCompletion();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('[BranchCompliance] compliance-items error:', err?.message || err?.statusText);
        this.items = [];
        this.selectedOverviewItem = null;
        this.computeKpi([]);
        this.loading = false;
        this.errorMessage = 'Failed to load compliance items — ' + (err?.error?.message || err?.statusText || 'server error');
        this.cdr.markForCheck();
      }
    });
  }

  // Open the correct execution workspace from the overview screen.
  openUploadWorkspace(it: any) {
    const target = this.workspaceRoute(it, this.isBranchUser);
    this.router.navigate([target], {
      queryParams: this.workspaceQueryParams(it),
    });
  }

  workspaceLabel(it: any): string {
    if (this.isBranchUser) {
      return this.isMonthlyWorkspaceItem(it) ? 'Open Monthly Compliance' : 'Open Periodic Uploads';
    }
    return it?.module === 'MCD' ? 'Open MCD Workspace' : 'Open Returns Workspace';
  }

  get isBranchUser(): boolean {
    return (this.auth.getBranchIds()?.length || 0) > 0;
  }

  get selectedBranch(): any | null {
    return this.branches.find((branch) => branch.id === this.branchId) || null;
  }

  get monthLabel(): string {
    if (!this.month || !/^\d{4}-\d{2}$/.test(this.month)) return this.month;
    const [year, month] = this.month.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  branchOptionLabel(branch: any): string {
    if (!branch) return 'Branch';
    return branch.branchCode ? `${branch.name} (${branch.branchCode})` : branch.name;
  }

  selectOverviewItem(item: any): void {
    this.selectedOverviewItem = item;
  }

  isSelected(item: any): boolean {
    return this.selectedOverviewItem?.code === item?.code;
  }

  scheduleSignal(item: any): ScheduleSignal {
    const today = this.startOfDay(new Date());
    const due = item?.dueDate ? this.startOfDay(new Date(item.dueDate)) : null;
    const windowOpen = item?.windowOpen ? this.startOfDay(new Date(item.windowOpen)) : null;
    const windowClose = item?.windowClose ? this.startOfDay(new Date(item.windowClose)) : null;

    if (due) {
      const days = this.diffDays(today, due);
      if (days < 0) return 'OVERDUE';
      if (days <= 7) return 'DUE_SOON';
      return 'SCHEDULED';
    }

    if (windowOpen && windowClose) {
      if (today.getTime() > windowClose.getTime()) return 'OVERDUE';
      if (today.getTime() < windowOpen.getTime()) return 'UPCOMING';
      const daysToClose = this.diffDays(today, windowClose);
      if (daysToClose <= 3) return 'DUE_SOON';
      return 'OPEN_WINDOW';
    }

    return 'SCHEDULED';
  }

  scheduleSignalLabel(item: any): string {
    switch (this.scheduleSignal(item)) {
      case 'OVERDUE':
        return 'Overdue';
      case 'DUE_SOON':
        return 'Due soon';
      case 'OPEN_WINDOW':
        return 'Window open';
      case 'UPCOMING':
        return 'Upcoming';
      default:
        return 'Scheduled';
    }
  }

  scheduleSignalClass(item: any): string {
    switch (this.scheduleSignal(item)) {
      case 'OVERDUE':
        return 'signal signal--overdue';
      case 'DUE_SOON':
        return 'signal signal--soon';
      case 'OPEN_WINDOW':
        return 'signal signal--open';
      case 'UPCOMING':
        return 'signal signal--upcoming';
      default:
        return 'signal signal--scheduled';
    }
  }

  detailSummary(item: any): string {
    const signal = this.scheduleSignal(item);
    if (signal === 'OVERDUE') return 'Immediate action required to avoid further compliance slippage.';
    if (signal === 'DUE_SOON') return 'This item needs attention soon to avoid slipping into overdue status.';
    if (signal === 'OPEN_WINDOW') return 'Upload window is open. This is a good time to complete the submission.';
    if (signal === 'UPCOMING') return 'The filing window has not opened yet, but the item is already on the schedule.';
    return 'This item is scheduled for the selected month and can be tracked from here.';
  }

  detailCtaLabel(item: any): string {
    const signal = this.scheduleSignal(item);
    return signal === 'OVERDUE' || signal === 'DUE_SOON' || signal === 'OPEN_WINDOW'
      ? this.workspaceLabel(item)
      : 'Open Workspace';
  }

  canOpenDocumentLibrary(item: any): boolean {
    return !this.isBranchUser && !!this.documentLibraryCategory(item);
  }

  documentLibraryLabel(item: any): string {
    if (item?.module === 'MCD') return 'View MCD Documents';
    if (item?.module === 'RETURNS') return 'View Return Documents';
    return 'View Documents';
  }

  openDocumentLibrary(item: any): void {
    const queryParams = this.documentLibraryQueryParams(item);
    if (!queryParams) return;
    this.router.navigate(['/client/compliance/library'], { queryParams });
  }

  scheduleText(item: any): string {
    if (item?.dueDate) return `Due on ${this.formatDate(item.dueDate)}`;
    if (item?.windowOpen && item?.windowClose) return `${this.formatDate(item.windowOpen)} to ${this.formatDate(item.windowClose)}`;
    return 'Schedule not configured';
  }

  private loadCompletion() {
    this.api.getComplianceCompletion(this.month, this.branchId).subscribe({
      next: (res: any) => {
        const row = res?.items?.[0];
        if (row) {
          this.completionPercent = row.completionPercent ?? 0;
          this.uploaded = row.uploaded ?? 0;
          this.totalApplicableCodes = row.totalApplicable ?? row.totalApplicableCodes ?? 0;
        } else {
          this.completionPercent = 0;
          this.uploaded = 0;
          this.totalApplicableCodes = 0;
        }
        this.completedCount = this.uploaded;
        this.pendingCount = Math.max(this.totalApplicableCodes - this.uploaded, 0);
        this.cdr.markForCheck();
        this.loadRiskScore();
      },
      error: () => {
        this.completionPercent = 0;
        this.uploaded = 0;
        this.totalApplicableCodes = 0;
        this.completedCount = 0;
        this.pendingCount = 0;
        this.cdr.markForCheck();
      }
    });
  }

  private loadRiskScore() {
    if (!this.branchId) return;
    this.api.getRiskScore(this.month, this.branchId).subscribe({
      next: (res: any) => {
        const row = (res?.items || [])[0];
        this.riskScore = row?.riskScore ?? 0;
        this.riskLevel = row?.riskLevel ?? 'LOW';
        this.inspectionProbability = row?.inspectionProbability ?? 0;
        this.riskReasons = row?.reasons || [];
        this.cdr.markForCheck();
        this.loadActionPlan();
      },
      error: () => {
        this.riskScore = 0;
        this.riskLevel = 'LOW';
        this.inspectionProbability = 0;
        this.riskReasons = [];
        this.cdr.markForCheck();
      }
    });
  }

  private loadActionPlan() {
    if (!this.branchId) return;
    this.actionPlanLoading = true;
    this.cdr.markForCheck();

    this.api.getActionPlan(this.month, this.branchId).subscribe({
      next: (res: any) => {
        this.actionPlan = res?.actions || [];
        this.actionPlanLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.actionPlan = [];
        this.actionPlanLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private computeKpi(all: any[]) {
    this.total = all.length;
    this.returnsCount = all.filter(x => x.module === 'RETURNS').length;
    this.mcdCount = all.filter(x => x.module === 'MCD').length;
    this.highCritical = all.filter(x => x.priority === 'HIGH' || x.priority === 'CRITICAL').length;
    this.overdueCount = all.filter((x) => this.scheduleSignal(x) === 'OVERDUE').length;
    this.dueSoonCount = all.filter((x) => this.scheduleSignal(x) === 'DUE_SOON').length;
  }

  badgeClass(p: string) {
    return `badge ${p}`;
  }

  private mapBranchOption(branch: any) {
    return {
      id: branch.id,
      name: branch.name || branch.branchName || branch.title || 'Branch',
      branchCode: branch.branchCode || branch.code || '',
      stateCode: branch.stateCode || branch.state || '',
      establishmentType: branch.establishmentType || branch.branchType || '',
    };
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private diffDays(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  private pickSelectedItem(items: any[], preferredCode?: string): any | null {
    if (!items.length) return null;
    if (preferredCode) {
      const match = items.find((item) => item.code === preferredCode);
      if (match) return match;
    }
    return items[0];
  }

  private isMonthlyWorkspaceItem(item: any): boolean {
    return item?.frequency === 'MONTHLY';
  }

  private workspaceRoute(item: any, isBranchUser: boolean): string {
    if (isBranchUser) {
      if (this.isMonthlyWorkspaceItem(item)) {
        return '/branch/compliance/monthly';
      }
      return `/branch/uploads/${this.periodicitySegment(item?.frequency)}`;
    }

    return item?.module === 'MCD' ? '/client/compliance/mcd' : '/client/compliance/returns';
  }

  private workspaceQueryParams(item: any): Record<string, string | number> {
    const focusCode = this.isBranchUser
      ? item?.branchFocusCode || item?.code || ''
      : item?.clientFocusCode || item?.code || '';
    const params: Record<string, string | number> = {
      branchId: this.branchId,
      month: this.month,
      module: item?.module || '',
      code: focusCode,
      title: item?.name || '',
    };

    const [yearStr, monthStr] = this.month.split('-');
    const monthNumber = Number(monthStr);
    const yearNumber = Number(yearStr);
    if (yearNumber) params['year'] = yearNumber;
    if (monthNumber) {
      params['periodMonth'] = monthNumber;
      if (item?.frequency === 'QUARTERLY') {
        params['quarter'] = Math.ceil(monthNumber / 3);
      }
      if (item?.frequency === 'HALF_YEARLY') {
        params['half'] = monthNumber >= 4 && monthNumber <= 9 ? 1 : 2;
      }
    }

    return params;
  }

  private documentLibraryQueryParams(item: any): Record<string, string | number> | null {
    const category = this.documentLibraryCategory(item);
    if (!category) return null;

    const [yearStr, monthStr] = this.month.split('-');
    const monthNumber = Number(monthStr);
    const yearNumber = Number(yearStr);

    const params: Record<string, string | number> = {
      category,
      branchId: this.branchId,
      title: item?.name || '',
      code: item?.clientFocusCode || item?.code || '',
    };

    if (yearNumber) params['periodYear'] = yearNumber;
    if (monthNumber) params['periodMonth'] = monthNumber;

    const subCategory = this.documentLibrarySubCategory(item);
    if (subCategory) params['subCategory'] = subCategory;

    return params;
  }

  private documentLibraryCategory(item: any): string {
    if (item?.documentCategory) return item.documentCategory;
    if (item?.module === 'RETURNS') return 'RETURN';
    if (item?.module === 'MCD') return 'MCD';
    return '';
  }

  private documentLibrarySubCategory(item: any): string {
    if (item?.documentSubCategory) return item.documentSubCategory;
    const code = String(item?.code || '').toUpperCase();
    if (!code) return '';
    if (code.includes('PF')) return 'PF';
    if (code.includes('ESI')) return 'ESI';
    if (code.includes('PT')) return 'PT';
    if (code.includes('LWF')) return 'LWF';
    if (code.includes('GST')) return 'GST';
    if (code.includes('TDS')) return 'TDS';
    if (code.includes('ROC')) return 'ROC';
    if (code.includes('MCD')) return 'MCD';
    return '';
  }

  private periodicitySegment(frequency: string): string {
    if (frequency === 'QUARTERLY') return 'quarterly';
    if (frequency === 'HALF_YEARLY') return 'half-yearly';
    if (frequency === 'YEARLY') return 'yearly';
    return 'yearly';
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  daysLabel(item: any): string {
    if (!item?.dueDate) return '';
    const today = this.startOfDay(new Date());
    const due = this.startOfDay(new Date(item.dueDate + 'T00:00:00'));
    const diff = this.diffDays(today, due);
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `${diff} days remaining`;
  }

  windowProgress(item: any): number {
    if (!item?.windowOpen || !item?.windowClose) return 0;
    const today = this.startOfDay(new Date());
    const open = this.startOfDay(new Date(item.windowOpen + 'T00:00:00'));
    const close = this.startOfDay(new Date(item.windowClose + 'T00:00:00'));
    if (today.getTime() < open.getTime()) return 0;
    if (today.getTime() > close.getTime()) return 100;
    const total = this.diffDays(open, close);
    const elapsed = this.diffDays(open, today);
    return total > 0 ? Math.round((elapsed / total) * 100) : 0;
  }

  windowProgressColor(item: any): string {
    const pct = this.windowProgress(item);
    if (pct >= 80) return '#f97316';
    if (pct >= 50) return '#eab308';
    return '#3b82f6';
  }

  windowDaysLabel(item: any): string {
    if (!item?.windowOpen || !item?.windowClose) return '';
    const today = this.startOfDay(new Date());
    const open = this.startOfDay(new Date(item.windowOpen + 'T00:00:00'));
    const close = this.startOfDay(new Date(item.windowClose + 'T00:00:00'));
    if (today.getTime() < open.getTime()) {
      const d = this.diffDays(today, open);
      return `Opens in ${d} day${d !== 1 ? 's' : ''}`;
    }
    if (today.getTime() > close.getTime()) {
      const d = this.diffDays(close, today);
      return `Closed ${d} day${d !== 1 ? 's' : ''} ago`;
    }
    const rem = this.diffDays(today, close);
    if (rem === 0) return 'Closes today';
    return `${rem} day${rem !== 1 ? 's' : ''} left in window`;
  }

  private toYYYYMM(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
}
