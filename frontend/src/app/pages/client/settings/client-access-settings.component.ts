import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
} from '../../../shared/ui';
import { ClientPayrollSettingsService, ClientPayrollAccessSettings } from '../../../core/client-payroll-settings.service';

interface BranchItem {
  id: string;
  branchname: string;
  branchCode?: string;
  selected: boolean;
}

@Component({
  standalone: true,
  selector: 'app-client-access-settings',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Access Settings"
        subtitle="Control what BranchDesk users can view/download">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading settings..."></ui-loading-spinner>
      <ui-empty-state *ngIf="!loading && error" title="Error" [description]="error"></ui-empty-state>

      <div *ngIf="!loading && !error" class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div class="text-sm text-gray-600 mb-4">
          These settings apply only to <b>BranchDesk (Branch users)</b>. Master Client users can always access payroll registers.
        </div>

        <div *ngIf="!isMaster" class="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          Only Master Client users can change these settings.
        </div>

        <div class="space-y-4">
          <label class="flex items-start gap-3">
            <input autocomplete="off" type="checkbox" id="allow-payroll" name="allowBranchPayrollAccess" [(ngModel)]="model.allowBranchPayrollAccess" [disabled]="!isMaster || saving" />
            <span>
              <div class="font-semibold text-gray-900">Allow Payroll Access for BranchDesk</div>
              <div class="text-xs text-gray-500">If OFF, the entire Payroll section will be hidden for branch users. They won't see payroll inputs, registers, or any payroll data.</div>
            </span>
          </label>

          <div [class.opacity-50]="!model.allowBranchPayrollAccess" [class.pointer-events-none]="!model.allowBranchPayrollAccess" class="ml-6 space-y-4 border-l-2 border-gray-200 pl-4">
            <label class="flex items-start gap-3">
              <input autocomplete="off" type="checkbox" id="allow-wage" name="allowBranchWageRegisters" [(ngModel)]="model.allowBranchWageRegisters" [disabled]="!isMaster || saving || !model.allowBranchPayrollAccess" />
              <span>
                <div class="font-semibold text-gray-900">Allow Wage Registers</div>
                <div class="text-xs text-gray-500">If OFF, wage-related registers will be hidden and download will be blocked for branch users.</div>
              </span>
            </label>

            <label class="flex items-start gap-3">
              <input autocomplete="off" type="checkbox" id="allow-salary" name="allowBranchSalaryRegisters" [(ngModel)]="model.allowBranchSalaryRegisters" [disabled]="!isMaster || saving || !model.allowBranchPayrollAccess" />
              <span>
                <div class="font-semibold text-gray-900">Allow Salary Registers</div>
                <div class="text-xs text-gray-500">If OFF, salary-related registers will be hidden and download will be blocked for branch users.</div>
              </span>
            </label>
          </div>

          <!-- Branch Scope Section -->
          <div class="pt-2 border-t border-gray-100">
            <div class="font-semibold text-gray-900 mb-1">Branch Payroll Data Scope</div>
            <div class="text-xs text-gray-500 mb-3">Select which branches can see payroll data when payroll access is enabled. Restricting to specific branches ensures each branch user only sees data for their branch.</div>

            <div class="flex flex-col gap-2 mb-3" [class.opacity-50]="!isMaster || saving">
              <label class="flex items-center gap-2 cursor-pointer">
                <input autocomplete="off" type="radio" name="payrollBranchScope" id="scope-all" value="ALL"
                  [(ngModel)]="model.payrollBranchScope"
                  [disabled]="!isMaster || saving" />
                <span class="text-sm font-medium text-gray-800">All Branches</span>
                <span class="text-xs text-gray-500 ml-1">(default — every branch user can access payroll data)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input autocomplete="off" type="radio" name="payrollBranchScope" id="scope-selected" value="SELECTED"
                  [(ngModel)]="model.payrollBranchScope"
                  [disabled]="!isMaster || saving" />
                <span class="text-sm font-medium text-gray-800">Specific Branches Only</span>
                <span class="text-xs text-gray-500 ml-1">(only selected branches get payroll access)</span>
              </label>
            </div>

            <!-- Branch checklist when SELECTED -->
            <div *ngIf="model.payrollBranchScope === 'SELECTED'" class="ml-6 border border-gray-200 rounded-xl bg-gray-50 p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Select Branches</span>
                <div class="flex gap-2">
                  <button type="button" class="text-xs text-blue-600 hover:underline" (click)="selectAllBranches()" [disabled]="!isMaster || saving">Select All</button>
                  <span class="text-gray-300">|</span>
                  <button type="button" class="text-xs text-blue-600 hover:underline" (click)="clearAllBranches()" [disabled]="!isMaster || saving">Clear All</button>
                </div>
              </div>
              <div *ngIf="branches.length === 0" class="text-xs text-gray-400 py-2">No branches found.</div>
              <div class="space-y-1 max-h-56 overflow-y-auto">
                <label *ngFor="let b of branches" class="flex items-center gap-2 py-1 px-1 rounded hover:bg-white cursor-pointer">
                  <input autocomplete="off" type="checkbox" [id]="'br-' + b.id" [(ngModel)]="b.selected" [name]="'br-' + b.id" [disabled]="!isMaster || saving" />
                  <span class="text-sm text-gray-800">{{ b.branchname }}</span>
                  <span *ngIf="b.branchCode" class="text-xs text-gray-400 font-mono">({{ b.branchCode }})</span>
                </label>
              </div>
              <div class="mt-2 text-xs text-gray-500">{{ selectedBranchCount }} of {{ branches.length }} branches selected</div>
            </div>
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading || saving" (clicked)="load()">Refresh</ui-button>
          <ui-button [disabled]="!isMaster || saving" (clicked)="save()">Save</ui-button>
          <span *ngIf="saving" class="text-xs text-gray-500">Saving...</span>
        </div>
      </div>
    </div>
  `,
  styles: [`.page{max-width:900px;margin:0 auto;padding:1rem;}`],
})
export class ClientAccessSettingsComponent implements OnInit, OnDestroy {
  loading = false;
  saving = false;
  error = '';
  isMaster = false;
  branches: BranchItem[] = [];
  private readonly destroy$ = new Subject<void>();

  model: ClientPayrollAccessSettings = {
    clientId: '',
    allowBranchPayrollAccess: false,
    allowBranchWageRegisters: false,
    allowBranchSalaryRegisters: false,
    payrollBranchScope: 'ALL',
    payrollAllowedBranchIds: [],
  };

  get selectedBranchCount(): number {
    return this.branches.filter((b) => b.selected).length;
  }

  constructor(
    private readonly svc: ClientPayrollSettingsService,
    private readonly auth: AuthService,
    private readonly branchesSvc: ClientBranchesService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.isMaster = this.auth.isMasterUser();
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    forkJoin({
      settings: this.svc.get(),
      branches: this.branchesSvc.list(),
    })
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }), takeUntil(this.destroy$))
      .subscribe({
        next: ({ settings: res, branches }) => {
          const allowedIds: string[] = Array.isArray(res?.payrollAllowedBranchIds) ? res.payrollAllowedBranchIds : [];
          this.model = {
            clientId: res?.clientId || this.auth.getUser()?.clientId || '',
            allowBranchPayrollAccess: res?.allowBranchPayrollAccess === true,
            allowBranchWageRegisters: res?.allowBranchWageRegisters === true,
            allowBranchSalaryRegisters: res?.allowBranchSalaryRegisters === true,
            payrollBranchScope: res?.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
            payrollAllowedBranchIds: allowedIds,
          };
          this.branches = (branches || []).map((b: any) => ({
            id: b.id,
            branchname: b.branchname || b.name || b.branchName || b.id,
            branchCode: b.branchCode || b.branch_code || '',
            selected: allowedIds.includes(b.id),
          }));
          this.cdr.detectChanges();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load settings';
          this.cdr.detectChanges();
        },
      });
  }

  selectAllBranches() {
    this.branches.forEach((b) => (b.selected = true));
  }

  clearAllBranches() {
    this.branches.forEach((b) => (b.selected = false));
  }

  save() {
    const payrollAllowedBranchIds =
      this.model.payrollBranchScope === 'SELECTED'
        ? this.branches.filter((b) => b.selected).map((b) => b.id)
        : [];

    this.saving = true;
    this.svc
      .update({
        allowBranchPayrollAccess: this.model.allowBranchPayrollAccess,
        allowBranchWageRegisters: this.model.allowBranchWageRegisters,
        allowBranchSalaryRegisters: this.model.allowBranchSalaryRegisters,
        payrollBranchScope: this.model.payrollBranchScope,
        payrollAllowedBranchIds,
      })
      .pipe(finalize(() => { this.saving = false; this.cdr.detectChanges(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.model = { ...this.model, ...res };
          this.toast.success('Settings saved');
          this.cdr.detectChanges();
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Could not save');
          this.cdr.detectChanges();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}