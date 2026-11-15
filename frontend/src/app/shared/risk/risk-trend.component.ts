import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { AdminApiService } from '../../core/admin-api.service';

@Component({
  selector: 'app-risk-trend',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './risk-trend.component.html',
  styleUrls: ['./risk-trend.component.scss'],
})
export class RiskTrendComponent implements OnInit, OnDestroy {
  clients: { id: string; name: string }[] = [];
  clientId = '';
  branches: { id: string; name: string }[] = [];
  branchId = '';
  from = '';
  to = '';
  points: any[] = [];
  loading = false;
  showClientPicker = false;
  loadError = '';
  clientLoadError = '';
  branchLoadError = '';
  clientsLoading = false;
  branchesLoading = false;
  trendLoaded = false;
  private mappedBranches: string[] = [];
  private clientRead?: Subscription;
  private branchRead?: Subscription;
  private trendRead?: Subscription;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private crmApi: CrmClientsApi,
    private adminApi: AdminApiService,
  ) {}

  ngOnInit(): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    this.from = this.toISO(start);
    this.to = this.toISO(now);

    const role = (this.auth.getRoleCode() || '').toUpperCase();
    this.mappedBranches = this.auth.getBranchIds() || [];
    this.showClientPicker = !(['CLIENT', 'BRANCH_DESK'].includes(role) || this.mappedBranches.length);
    this.branchId = '';
    if (this.showClientPicker) {
      this.retryClients();
    } else {
      if (this.mappedBranches.length) {
        this.branchId = this.mappedBranches[0];
        this.branches = this.mappedBranches.map(id => ({ id, name: 'Branch' }));
        this.load();
      }
      this.retryBranches();
    }
  }

  retryClients(): void {
    this.clientRead?.unsubscribe();
    this.clientsLoading = true;
    this.clientLoadError = '';
    const source = this.auth.getRoleCode()?.toUpperCase() === 'CRM'
      ? this.crmApi.getAssignedClients() : this.adminApi.getAdminClients();
    this.clientRead = source.subscribe({
      next: (cs: any[]) => {
        this.clients = (cs || []).map(c => ({ id: c.id, name: c.clientName || c.name || 'Client' }));
        this.clientsLoading = false;
        this.clientId = this.clients[0]?.id || '';
        this.onClientChange();
      },
      error: () => {
        this.clientsLoading = false;
        this.clientLoadError = 'Client options could not be loaded.';
        this.cdr.markForCheck();
      },
    });
    this.cdr.markForCheck();
  }

  onClientChange(): void {
    this.branchRead?.unsubscribe();
    this.resetTrend();
    this.branchId = '';
    this.branches = [];
    this.branchesLoading = false;
    this.branchLoadError = '';
    if (this.clientId) this.retryBranches();
    this.cdr.markForCheck();
  }

  retryBranches(): void {
    this.branchRead?.unsubscribe();
    if (this.showClientPicker && !this.clientId) return;
    this.branchesLoading = true;
    this.branchLoadError = '';
    const role = (this.auth.getRoleCode() || '').toUpperCase();
    const obs$ = !this.showClientPicker ? this.api.list() : role === 'CRM'
        ? this.crmApi.getBranchesForClient(this.clientId)
        : this.adminApi.getBranchesForAdminClient(this.clientId);
    this.branchRead = obs$.subscribe({
      next: (bs: any[]) => {
        const options = (bs || []).map(b => ({ id: b.id, name: b.branchName || b.name || b.title || 'Branch' }));
        // A names-only retry must preserve the user's current branch and chart.
        this.branches = this.mappedBranches.length
          ? this.mappedBranches.map(id => ({ id, name: options.find(b => b.id === id)?.name || 'Branch' }))
          : options;
        this.branchesLoading = false;
        if (!this.branches.some(b => b.id === this.branchId)) {
          this.branchId = this.branches[0]?.id || '';
          this.load();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.branchesLoading = false;
        this.branchLoadError = 'Branch options could not be loaded.';
        this.cdr.markForCheck();
      },
    });
    this.cdr.markForCheck();
  }

  load(): void {
    this.resetTrend();
    if (!this.branchId) return;
    if (!this.validDate(this.from) || !this.validDate(this.to) || this.from > this.to) {
      this.loadError = 'Choose a valid date range with the start date on or before the end date.';
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.cdr.markForCheck();

    this.trendRead = this.api.getRiskTrend({ branchId: this.branchId, from: this.from, to: this.to }).subscribe({
      next: (res: any) => {
        this.points = res.points || [];
        this.loading = false;
        this.trendLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.points = [];
        this.loading = false;
        this.loadError = 'Risk history could not be loaded. Retry before relying on this view.';
        this.cdr.markForCheck();
      },
    });
  }

  private resetTrend(): void {
    this.trendRead?.unsubscribe();
    this.points = [];
    this.loading = false;
    this.trendLoaded = false;
    this.loadError = '';
    this.cdr.markForCheck();
  }

  private validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  ngOnDestroy(): void {
    this.clientRead?.unsubscribe();
    this.branchRead?.unsubscribe();
    this.trendRead?.unsubscribe();
  }

  get maxScore(): number {
    return Math.max(...this.points.map((p) => p.riskScore), 0);
  }

  barHeight(score: number): number {
    const max = this.maxScore || 100;
    return (score / max) * 100;
  }

  barClass(score: number): string {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  private toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
