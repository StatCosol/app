import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
} from '../../../shared/ui';
import { ClientPayrollSettingsService, ClientPayrollAccessSettings } from '../../../core/client-payroll-settings.service';

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
  private readonly destroy$ = new Subject<void>();

  model: ClientPayrollAccessSettings = {
    clientId: '',
    allowBranchPayrollAccess: false,
    allowBranchWageRegisters: false,
    allowBranchSalaryRegisters: false,
  };

  constructor(
    private readonly svc: ClientPayrollSettingsService,
    private readonly auth: AuthService,
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
    this.svc
      .get()
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.model = {
            clientId: res?.clientId || this.auth.getUser()?.clientId || '',
            allowBranchPayrollAccess: res?.allowBranchPayrollAccess === true,
            allowBranchWageRegisters: res?.allowBranchWageRegisters === true,
            allowBranchSalaryRegisters: res?.allowBranchSalaryRegisters === true,
          };
          this.cdr.detectChanges();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load settings';
          this.cdr.detectChanges();
        },
      });
  }

  save() {
    this.saving = true;
    this.svc
      .update({
        allowBranchPayrollAccess: this.model.allowBranchPayrollAccess,
        allowBranchWageRegisters: this.model.allowBranchWageRegisters,
        allowBranchSalaryRegisters: this.model.allowBranchSalaryRegisters,
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