import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { PageHeaderComponent, DataTableComponent, TableColumn, TableCellDirective, LoadingSpinnerComponent, EmptyStateComponent, StatusBadgeComponent } from '../../shared/ui';

@Component({
  selector: 'app-payroll-clients',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent, TableCellDirective, LoadingSpinnerComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <ui-page-header
        title="Assigned Clients"
        description="Clients assigned to your payroll processing"
        icon="users">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading clients..." size="lg"></ui-loading-spinner>

      <ui-empty-state
        *ngIf="error && !loading"
        title="Unable to Load Clients"
        [description]="error">
      </ui-empty-state>

      <ui-empty-state
        *ngIf="!loading && !error && clients.length === 0"
        title="No Assigned Clients"
        description="No clients have been assigned to you yet.">
      </ui-empty-state>

      <ui-data-table
        *ngIf="!loading && !error && clients.length > 0"
        [columns]="columns"
        [data]="clients"
        [loading]="loading"
        [clickable]="true"
        (rowClick)="openClient($event)"
        emptyMessage="No assigned clients found.">
        
        <ng-template uiTableCell="name" let-row>
          <div class="font-semibold text-gray-900">{{ row.name }}</div>
          <div *ngIf="row.clientCode" class="text-xs text-gray-500 mt-0.5">Code: {{ row.clientCode }}</div>
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <ui-status-badge [status]="row.status || 'ACTIVE'"></ui-status-badge>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    `,
  ],
})
export class PayrollClientsComponent implements OnInit, OnDestroy {
  clients: PayrollClient[] = [];
  loading = false;
  error = '';
  private destroy$ = new Subject<void>();

  columns: TableColumn[] = [
    { key: 'name', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', sortable: true, width: '150px', align: 'center' },
  ];

  constructor(
    private payrollApi: PayrollApiService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.cdr.detectChanges();
    this.payrollApi.getAssignedClients().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => {
        this.loading = false;
        this.clients = list || [];
        this.cdr.detectChanges();

        // If navigated with ?runId=..., auto-open the first client (or single client)
        const runId = this.route.snapshot.queryParamMap.get('runId');
        if (runId && this.clients.length >= 1) {
          this.openClient({ row: this.clients[0], index: 0 }, runId);
        }
      },
      error: (e) => {
        this.loading = false;
        this.error = `Unable to load clients. ${e?.error?.message || e?.message || ''}`;
        this.cdr.detectChanges();
      },
    });
  }

  openClient(event: { row: PayrollClient; index: number }, runId?: string): void {
    const client = event.row;
    const id = client.id || (client as any).clientId;
    if (id) {
      const extras: any = {};
      if (runId) {
        extras.queryParams = { runId };
      }
      this.router.navigate(['/payroll/clients', id, 'runs'], extras);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
