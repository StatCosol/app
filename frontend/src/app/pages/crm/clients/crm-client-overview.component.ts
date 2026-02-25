import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { CrmService } from '../../../core/crm.service';

interface ClientTab {
  label: string;
  route: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'app-crm-client-overview',
  imports: [CommonModule, RouterModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        [title]="clientName ? 'Client: ' + clientName : 'Client Workspace'"
        description="Manage branches, contractors, compliance, documents & payroll for this client"
        icon="office-building">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading client info..."></ui-loading-spinner>

      <div *ngIf="accessDenied" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
        Access denied for this client.
      </div>

      <div *ngIf="!loading && !accessDenied">
        <!-- Client Info Card -->
        <div *ngIf="clientName" class="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
            {{ clientName.charAt(0) }}
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{{ clientName }}</h3>
            <p class="text-sm text-gray-500">Client Code: {{ clientCode || '—' }}</p>
          </div>
        </div>

        <!-- Tab Navigation -->
        <nav class="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
          <a *ngFor="let tab of tabs"
             [routerLink]="['/crm/clients', clientId, tab.route]"
             routerLinkActive="bg-white text-indigo-700 shadow-sm"
             [routerLinkActiveOptions]="{ exact: true }"
             class="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium text-gray-600
                    hover:text-gray-900 transition-colors whitespace-nowrap">
            <span>{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
          </a>
        </nav>

        <!-- Quick Actions Grid (shown on overview page) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a *ngFor="let tab of tabs"
             [routerLink]="['/crm/clients', clientId, tab.route]"
             class="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200
                    transition-all group cursor-pointer">
            <div class="text-2xl mb-3">{{ tab.icon }}</div>
            <h4 class="text-base font-semibold text-gray-900 group-hover:text-indigo-700">{{ tab.label }}</h4>
            <p class="text-sm text-gray-500 mt-1">{{ tab.description }}</p>
          </a>
        </div>
      </div>
    </main>
  `,
})
export class CrmClientOverviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  clientId = '';
  clientName = '';
  clientCode = '';
  loading = true;
  accessDenied = false;

  tabs: (ClientTab & { description: string })[] = [
    { label: 'Branches', route: 'branches', icon: '🏢', description: 'Manage branch offices and locations' },
    { label: 'Contractors', route: 'contractors', icon: '👷', description: 'View and manage linked contractors' },
    { label: 'Compliance', route: 'compliance-tracker', icon: '✅', description: 'Track compliance tasks and deadlines' },
    { label: 'Registrations', route: 'registrations', icon: '📋', description: 'Manage branch registrations & licenses' },
    { label: 'Documents', route: 'documents', icon: '📄', description: 'View contractor documents' },
    { label: 'Payroll', route: 'payroll-status', icon: '💰', description: 'Monitor payroll processing status' },
  ];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly crmService: CrmService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.clientId = params.get('clientId') ?? '';
      this.loadClient();
    });
  }

  private loadClient() {
    if (!this.clientId) return;
    this.loading = true;
    this.accessDenied = false;

    this.crmService.getAssignedClientsCached().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (clients) => {
        this.loading = false;
        const match = (clients || []).find(
          (c: any) => c?.id === this.clientId || c?.clientId === this.clientId,
        );
        if (match) {
          this.clientName = match.clientName || match.name || '';
          this.clientCode = match.clientCode || '';
        } else {
          this.accessDenied = true;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.accessDenied = true;
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
