import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AuditsService } from '../../core/audits.service';

@Component({
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './auditor-entry.component.html',
  styleUrls: ['./auditor-audit-workspace.component.scss'],
})
export class AuditorEntryComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  loading = true;
  busy = false;
  error = '';
  clients: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; clientId: string; name: string }> = [];
  contractors: Array<{ id: string; clientId: string; branchId: string; name: string }> = [];
  auditTypes: string[] = [];
  clientId = '';
  branchId = '';
  auditType = '';
  periodCode = '';
  contractorUserId = '';

  constructor(private api: AuditsService, private router: Router, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.auditorEntryOptions().pipe(takeUntil(this.destroy$), finalize(() => {
      this.loading = false; this.cdr.markForCheck();
    })).subscribe({
      next: data => {
        this.clients = data.clients || []; this.branches = data.branches || [];
        this.contractors = data.contractors || []; this.auditTypes = data.auditTypes || [];
      },
      error: () => { this.error = 'Audit options could not be loaded. Please retry.'; },
    });
  }

  get branchOptions() { return this.branches.filter(branch => branch.clientId === this.clientId); }
  get contractorOptions() { return this.contractors.filter(contractor => contractor.clientId === this.clientId && contractor.branchId === this.branchId); }
  changeClient(): void { this.branchId = ''; this.contractorUserId = ''; }
  changeBranch(): void { this.contractorUserId = ''; }
  changeType(): void { this.contractorUserId = ''; }
  typeLabel(value: string): string {
    const labels: Record<string, string> = { CONTRACTOR: 'Contractor audit', FACTORY: 'Factory audit',
      SHOPS_ESTABLISHMENT: 'Shops & establishment audit', LABOUR_EMPLOYMENT: 'Labour & employment audit',
      FSSAI: 'FSSAI audit', HR: 'HR audit', PAYROLL: 'Payroll audit', GAP: 'Gap audit' };
    return labels[value] || value;
  }
  get canStart(): boolean {
    return !this.loading && !this.busy && this.clients.some(client => client.id === this.clientId)
      && this.branchOptions.some(branch => branch.id === this.branchId)
      && this.auditTypes.includes(this.auditType) && /^\d{4}-(0[1-9]|1[0-2])$/.test(this.periodCode)
      && (this.auditType !== 'CONTRACTOR' || this.contractorOptions.some(contractor => contractor.id === this.contractorUserId));
  }
  start(): void {
    if (!this.canStart) return;
    this.busy = true; this.error = '';
    this.api.auditorStartEntry({ clientId: this.clientId, branchId: this.branchId, auditType: this.auditType,
      periodCode: this.periodCode, ...(this.auditType === 'CONTRACTOR' ? { contractorUserId: this.contractorUserId } : {}),
    }).pipe(takeUntil(this.destroy$), finalize(() => { this.busy = false; this.cdr.markForCheck(); })).subscribe({
      next: result => { void this.router.navigate(['/auditor/audits', result.auditId, 'workspace']); },
      error: err => { this.error = err?.error?.message || 'The audit could not be opened. Your selections have been kept; retry when ready.'; },
    });
  }
}
