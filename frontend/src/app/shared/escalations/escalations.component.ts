import { IconComponent } from '../ui/icon/icon.component';
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { AdminApiService } from '../../core/admin-api.service';

@Component({
  standalone: true,
  selector: 'app-escalations',
  imports: [IconComponent, CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './escalations.component.html',
  styleUrls: ['./escalations.component.scss'],
})
export class EscalationsComponent implements OnInit, OnDestroy {
  items: any[] = [];
  filtered: any[] = [];
  loading = false;

  branches: any[] = [];
  selectedBranch = '';
  selectedStatus = '';

  roleCode = '';
  isBranchUser = false;
  loaded = false;
  loadError = '';
  actionError = '';
  clientId = '';
  clients: any[] = [];
  showClientPicker = false;
  clientsLoading = false;
  branchesLoading = false;
  clientLoadError = '';
  branchLoadError = '';
  private clientRead?: Subscription;
  private branchRead?: Subscription;
  private listRead?: Subscription;
  private updates = new Subscription();
  private savingIds = new Set<string>();
  private unconfirmedIds = new Set<string>();

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private crmApi: CrmClientsApi,
    private adminApi: AdminApiService,
  ) {}

  ngOnInit(): void {
    this.roleCode = this.auth.getRoleCode();
    const bids = this.auth.getBranchIds();
    this.isBranchUser = bids.length > 0 && !this.auth.isMasterUser();

    this.showClientPicker = ['CRM', 'ADMIN'].includes(this.roleCode);
    if (this.showClientPicker) this.retryClients();
    else { if (!this.isBranchUser) this.retryBranches(); this.load(); }
  }

  retryClients(): void {
    this.clientRead?.unsubscribe(); this.clientsLoading = true; this.clientLoadError = '';
    const source = this.roleCode === 'CRM' ? this.crmApi.getAssignedClients() : this.adminApi.getAdminClients();
    this.clientRead = source.subscribe({
      next: (rows: any[]) => { this.clients = rows || []; this.clientsLoading = false; this.clientId = this.clients[0]?.id || ''; this.onClientChange(); },
      error: () => { this.clientsLoading = false; this.clientLoadError = 'Client options could not be loaded.'; this.cdr.markForCheck(); },
    });
    this.cdr.markForCheck();
  }

  onClientChange(): void {
    this.branchRead?.unsubscribe(); this.clearResults(); this.branches = []; this.selectedBranch = ''; this.branchesLoading = false; this.branchLoadError = '';
    if (this.clientId) { this.retryBranches(); this.load(); }
    this.cdr.markForCheck();
  }

  retryBranches(): void {
    this.branchRead?.unsubscribe(); this.branchesLoading = true; this.branchLoadError = '';
    const source = !this.showClientPicker ? this.api.list() : this.roleCode === 'CRM'
      ? this.crmApi.getBranchesForClient(this.clientId) : this.adminApi.getBranchesForAdminClient(this.clientId);
    this.branchRead = source.subscribe({
      next: (rows: any[]) => { this.branches = rows || []; this.branchesLoading = false; this.cdr.markForCheck(); },
      error: () => { this.branchesLoading = false; this.branchLoadError = 'Branch options could not be loaded.'; this.cdr.markForCheck(); },
    });
    this.cdr.markForCheck();
  }

  load(): void {
    this.clearResults();
    if (this.showClientPicker && !this.clientId) return;
    this.loading = true;
    this.cdr.markForCheck();

    const params: any = {};
    if (this.selectedStatus) params.status = this.selectedStatus;
    if (this.selectedBranch) params.branchId = this.selectedBranch;
    if (this.showClientPicker) params.clientId = this.clientId;

    this.listRead = this.api.getEscalations(params).subscribe({
      next: (res: any) => {
        this.items = res.items || [];
        this.applyFilter();
        this.items.forEach(it => this.unconfirmedIds.delete(it.id));
        this.loading = false;
        this.loaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.items = [];
        this.filtered = [];
        this.loading = false;
        this.loadError = 'Escalations could not be loaded. Retry before relying on this list or its counts.';
        this.cdr.markForCheck();
      },
    });
  }

  applyFilter(): void {
    this.filtered = this.items;
  }

  updateStatus(item: any, status: string): void {
    if (!item?.id || !this.loaded || this.loading || this.loadError || !this.items.includes(item)
      || this.isSaving(item.id) || this.isUnconfirmed(item.id) || item.status === 'CLOSED'
      || item.status === status || !['ACK', 'CLOSED'].includes(status)) return;
    const clientId = item.clientId || this.clientId;
    if (this.showClientPicker && !clientId) { this.actionError = 'Refresh the escalation to confirm its client before updating.'; this.cdr.markForCheck(); return; }
    const scope = this.scopeKey();
    this.actionError = ''; this.savingIds.add(item.id); this.cdr.markForCheck();
    this.updates.add(this.api.updateEscalation(item.id, { status, ...(clientId ? { clientId } : {}) }).subscribe({
      // A committed action must reconcile the current queue even after a filter change.
      next: () => { this.savingIds.delete(item.id); this.load(); },
      error: () => {
        this.savingIds.delete(item.id); this.unconfirmedIds.add(item.id);
        const sameRecords = (!this.showClientPicker || this.clientId === clientId)
          && (!this.selectedBranch || this.selectedBranch === item.branchId);
        // A read started before an uncertain save cannot establish its outcome.
        if (this.loading && sameRecords) { this.clearResults(); this.loadError = 'Refresh escalations to confirm the latest statuses.'; }
        if (scope === this.scopeKey() || this.items.some(row => row.id === item.id)) this.actionError = 'The escalation status could not be confirmed. Refresh before trying again.';
        this.cdr.markForCheck();
      },
    }));
  }

  isSaving(id: string): boolean { return this.savingIds.has(id); }
  isUnconfirmed(id: string): boolean { return this.unconfirmedIds.has(id); }
  private scopeKey(): string { return JSON.stringify([this.clientId, this.selectedBranch, this.selectedStatus]); }
  private clearResults(): void { this.listRead?.unsubscribe(); this.items = []; this.filtered = []; this.loading = false; this.loaded = false; this.loadError = ''; this.actionError = ''; this.cdr.markForCheck(); }
  ngOnDestroy(): void { this.clientRead?.unsubscribe(); this.branchRead?.unsubscribe(); this.listRead?.unsubscribe(); this.updates.unsubscribe(); }

  severityClass(score: number): string {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  get openCount(): number {
    return this.items.filter((i) => i.status === 'OPEN').length;
  }

  get ackCount(): number {
    return this.items.filter((i) => i.status === 'ACK').length;
  }

  get closedCount(): number {
    return this.items.filter((i) => i.status === 'CLOSED').length;
  }
}
