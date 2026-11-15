import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { AdminApiService } from '../../core/admin-api.service';

@Component({
  selector: 'app-sla-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sla-tracker.component.html',
  styleUrls: ['./sla-tracker.component.scss'],
})
export class SlaTrackerComponent implements OnInit, OnDestroy {
  status = 'OPEN';
  module = 'ALL';
  branchId = '';

  branches: any[] = [];
  items: any[] = [];
  loading = false;
  tasksLoaded = false;
  loadError = '';
  actionError = '';
  clientId = '';
  clients: { id: string; name: string }[] = [];
  showClientPicker = false;
  clientsLoading = false;
  branchesLoading = false;
  clientLoadError = '';
  branchLoadError = '';
  private mappedBranches: string[] = [];
  private clientRead?: Subscription;
  private branchRead?: Subscription;
  private taskRead?: Subscription;
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
    const role = (this.auth.getRoleCode() || '').toUpperCase();
    this.mappedBranches = this.auth.getBranchIds() || [];
    this.showClientPicker = ['CRM', 'ADMIN', 'CCO', 'CEO'].includes(role);
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
      next: (clients: any[]) => {
        this.clients = (clients || []).map(c => ({ id: c.id, name: c.clientName || c.name || 'Client' }));
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
    this.clearTasks();
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
    const source = !this.showClientPicker ? this.api.list()
      : this.auth.getRoleCode()?.toUpperCase() === 'CRM'
        ? this.crmApi.getBranchesForClient(this.clientId)
        : this.adminApi.getBranchesForAdminClient(this.clientId);
    this.branchRead = source.subscribe({
      next: (branches: any[]) => {
        const options = (branches || []).map(b => ({ id: b.id, name: b.branchName || b.name || b.title || 'Branch' }));
        // A branch-name retry must not reset the user's selected branch or tasks.
        this.branches = !this.showClientPicker && this.mappedBranches.length
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
    this.clearTasks();
    if (!this.branchId || (this.showClientPicker && (!this.clientId || this.branchesLoading))) return;
    this.loading = true;
    this.cdr.markForCheck();

    const params: any = { status: this.status };
    if (this.module !== 'ALL') params.module = this.module;
    if (this.branchId) params.branchId = this.branchId;
    if (this.showClientPicker) params.clientId = this.clientId;

    this.taskRead = this.api.getSlaTasks(params).subscribe({
      next: (res: any) => {
        this.items = res.items || [];
        this.items.forEach(it => this.unconfirmedIds.delete(it.id));
        this.loading = false;
        this.tasksLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.items = [];
        this.loading = false;
        this.loadError = 'SLA tasks could not be loaded. Retry before relying on this list.';
        this.cdr.markForCheck();
      },
    });
  }

  setStatus(it: any, status: string): void {
    if (!it?.id || !this.tasksLoaded || this.loading || this.loadError || this.isSaving(it.id) || this.isUnconfirmed(it.id)
      || !this.items.includes(it) || this.workStatus(it) === 'CLOSED' || this.workStatus(it) === status
      || !['IN_PROGRESS', 'CLOSED'].includes(status)) return;
    const scope = this.scopeKey();
    const recordScope = JSON.stringify([this.clientId, this.branchId]);
    this.actionError = '';
    this.savingIds.add(it.id);
    this.cdr.markForCheck();
    this.updates.add(this.api.updateSlaTask(it.id, { status }).subscribe({
      // Re-read the currently selected filters after the server commits. This also
      // invalidates any pre-save response already loading for that selection.
      next: () => { this.savingIds.delete(it.id); this.load(); },
      error: () => {
        this.savingIds.delete(it.id);
        this.unconfirmedIds.add(it.id);
        // A read started before this uncertain save cannot confirm its outcome.
        if (this.loading && recordScope === JSON.stringify([this.clientId, this.branchId])) {
          this.clearTasks();
          this.loadError = 'Refresh SLA tasks to confirm the latest task statuses.';
        }
        if (scope === this.scopeKey() || this.items.some(row => row.id === it.id)) this.actionError = 'The task status could not be confirmed. Refresh the task list before trying again.';
        this.cdr.markForCheck();
      },
    }));
  }

  isSaving(id: string): boolean { return this.savingIds.has(id); }
  isUnconfirmed(id: string): boolean { return this.unconfirmedIds.has(id); }
  workStatus(it: any): string { return it.workflowStatus || (it.status === 'OVERDUE' ? 'OPEN' : it.status); }

  private scopeKey(): string { return JSON.stringify([this.clientId, this.branchId, this.module, this.status]); }

  private clearTasks(): void {
    this.taskRead?.unsubscribe();
    this.items = [];
    this.loading = false;
    this.tasksLoaded = false;
    this.loadError = '';
    this.actionError = '';
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.clientRead?.unsubscribe();
    this.branchRead?.unsubscribe();
    this.taskRead?.unsubscribe();
    this.updates.unsubscribe();
  }

  get openCount(): number {
    return this.items.filter((i) => i.status === 'OPEN').length;
  }

  get overdueCount(): number {
    return this.items.filter((i) => i.status === 'OVERDUE').length;
  }
}
