import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { ClientContextStripComponent } from '../../shared/ui';
import { ClientContextService } from '../../core/client-context.service';

interface WorkspaceTab {
  label: string;
  route: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-payroll-client-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, ClientContextStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div *ngIf="loading" class="loader">Loading client workspace...</div>

      <div *ngIf="!loading && client" class="workspace">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">
          <div>
            <h2 class="workspace-title" style="margin-bottom:0;">Client Workspace</h2>
            <p class="workspace-desc">Select a module to begin working on {{ client.name || client.clientName || 'this client' }}'s payroll.</p>
          </div>
          <ui-client-context-strip [inline]="true" paramKey="clientId"></ui-client-context-strip>
        </div>

        <div class="tab-grid">
          <a
            *ngFor="let tab of tabs"
            [routerLink]="tab.route"
            class="tab-card"
          >
            <div class="tab-icon" [innerHTML]="tab.icon"></div>
            <div class="tab-content">
              <strong>{{ tab.label }}</strong>
              <span>{{ tab.description }}</span>
            </div>
            <svg class="tab-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </a>
        </div>
      </div>

      <div *ngIf="!loading && error" class="error-card">
        <p>{{ error }}</p>
        <a routerLink="/payroll/clients" class="btn btn-ghost">Back to Clients</a>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    .loader { text-align: center; padding: 3rem; color: #6b7280; }
    .workspace-title { font-size: 1.25rem; font-weight: 700; color: #111827; margin: 1.5rem 0 0.25rem; }
    .workspace-desc { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .tab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0.75rem; }
    .tab-card {
      display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
      background: white; border: 1px solid #e5e7eb; border-radius: 0.75rem;
      text-decoration: none; color: inherit; transition: all 0.15s ease;
    }
    .tab-card:hover { border-color: #6366f1; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1); }
    .tab-icon { width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: 0.5rem;
      background: #eef2ff; display: flex; align-items: center; justify-content: center; color: #6366f1; }
    .tab-icon :deep(svg) { width: 1.25rem; height: 1.25rem; }
    .tab-content { flex: 1; display: flex; flex-direction: column; }
    .tab-content strong { font-size: 0.875rem; font-weight: 600; color: #111827; }
    .tab-content span { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
    .tab-arrow { width: 1rem; height: 1rem; color: #9ca3af; flex-shrink: 0; }
    .tab-card:hover .tab-arrow { color: #6366f1; }
    .error-card { text-align: center; padding: 3rem; color: #dc2626; }
    .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 0.5rem; text-decoration: none; margin-top: 1rem; }
    .btn-ghost { border: 1px solid #d1d5db; color: #374151; }
    .btn-ghost:hover { background: #f9fafb; }
  `],
})
export class PayrollClientOverviewComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private clientId = '';
  client: PayrollClient | null = null;
  loading = true;
  error = '';

  tabs: WorkspaceTab[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private payrollApi: PayrollApiService,
    private clientCtx: ClientContextService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (!this.clientId) {
      this.router.navigate(['/payroll/clients']);
      return;
    }

    this.buildTabs();

    this.payrollApi.getAssignedClients().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (clients) => {
        this.client = (clients || []).find(
          (c) => c.id === this.clientId || (c as any).clientId === this.clientId,
        ) || null;
        if (this.client) {
          this.clientCtx.set({
            id: this.clientId,
            clientName: this.client.name || this.client.clientName || '',
            clientCode: this.client.clientCode || '',
          });
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Unable to load client details.';
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildTabs(): void {
    const base = `/payroll/clients/${this.clientId}`;
    this.tabs = [
      { label: 'Employees', route: `${base}/employees`, icon: this.svgIcon('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'), description: 'Employee master data' },
      { label: 'Payroll Runs', route: `${base}/runs`, icon: this.svgIcon('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'), description: 'Monthly payroll processing' },
      { label: 'PF / ESI Compliance', route: `${base}/pf-esi`, icon: this.svgIcon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'), description: 'Statutory compliance tracking' },
      { label: 'Registers', route: `${base}/registers`, icon: this.svgIcon('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z'), description: 'Statutory register generation' },
      { label: 'Full & Final', route: `${base}/full-and-final`, icon: this.svgIcon('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'), description: 'Settlement processing' },
      { label: 'Queries', route: `${base}/queries`, icon: this.svgIcon('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z'), description: 'Client payroll queries' },
      { label: 'Payroll Setup', route: `${base}/setup`, icon: this.svgIcon('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'), description: 'Client-specific payroll config' },
      { label: 'Rule Sets', route: `${base}/rule-sets`, icon: this.svgIcon('M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'), description: 'Calculation rules & formulas' },
      { label: 'Salary Structures', route: `${base}/structures`, icon: this.svgIcon('M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z'), description: 'Salary component structures' },
    ];
  }

  private svgIcon(d: string): string {
    return `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;
  }
}
