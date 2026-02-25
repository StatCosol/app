import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subject, Subscription } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { catchError, finalize, timeout } from 'rxjs/operators';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  AdminPayrollAssignmentsService,
  PayrollAssignment,
} from './admin-payroll-assignments.service';
import { PageHeaderComponent, ActionButtonComponent, FormSelectComponent, SelectOption, DataTableComponent, TableColumn, TableCellDirective, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';

type Option = { id: string; name: string };

@Component({
  selector: 'app-admin-payroll-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, ActionButtonComponent, FormSelectComponent, DataTableComponent, TableCellDirective, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-payroll-assignments.component.html',
  styleUrls: ['./admin-payroll-assignments.component.scss'],
})
export class AdminPayrollAssignmentsComponent implements OnInit, OnDestroy {
  private api = inject(AdminPayrollAssignmentsService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  
  private destroy$ = new Subject<void>();
  private subscriptions = new Subscription();
  private isInitialized = false;

  clients: Option[] = [];
  payrollUsers: Option[] = [];
  assignments: PayrollAssignment[] = [];
  clientSelectOptions: SelectOption[] = [];
  payrollUserSelectOptions: SelectOption[] = [];

  loading = true;
  error = '';

  form = {
    clientId: null as string | null,
    payrollUserId: null as string | null,
  };

  assignmentsColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: false },
    { key: 'payrollUserName', header: 'Payroll User', sortable: false },
    { key: 'startDate', header: 'Start Date', sortable: false },
    { key: 'status', header: 'Status', sortable: false },
    { key: 'actions', header: 'Actions', sortable: false },
  ];

  ngOnInit(): void {
    // Prevent duplicate initialization
    if (this.isInitialized) {
      console.warn('[PayrollAssignments] Duplicate ngOnInit prevented');
      return;
    }
    this.isInitialized = true;
    this.loadAll();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';

    const handleLoadError = (label: string) => (err: unknown) => {
      console.error(`${label} load error`, err);
      if (!this.error) this.error = `Some data failed to load (${label})`;
      return of([]);
    };

    const sub = forkJoin({
      clients: this.api.getClients().pipe(timeout(8000), catchError(handleLoadError('Clients'))),
      payrollUsers: this.api.getPayrollUsers().pipe(timeout(8000), catchError(handleLoadError('Payroll users'))),
    })
      .pipe(
        switchMap(({ clients, payrollUsers }) => {
          this.clients = this.toOptions(clients, 'client');
          this.payrollUsers = this.toOptions(payrollUsers, 'user');
          this.rebuildSelectOptions();

          // For each client, fetch current active payroll assignment.
          // Backend only exposes GET /api/admin/payroll-assignments/:clientId.
          const calls = this.clients.map((c) =>
            this.api.getCurrentAssignment(c.id).pipe(
              catchError((err) => {
                console.error('getCurrentAssignment error', c.id, err);
                return of(null);
              }),
            ),
          );

          return forkJoin(calls).pipe(
            // Carry along already loaded options
            switchMap((rows) => of({ assignments: rows })),
          );
        }),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ assignments }) => {
          // Normalize and keep only active assignments
          const normalized = this.normalizeAssignments(assignments);
          this.assignments = normalized;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Payroll assignments load error', err);
          this.error = 'Failed to load payroll assignments';
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
      
    this.subscriptions.add(sub);
  }

  private toOptions(rows: any, kind: 'client' | 'user'): Option[] {
    const arr = Array.isArray(rows) ? rows : (rows?.data ?? []);
    return (arr || [])
      .map((r: any) => {
        const id = r?.id ?? r?.userId ?? r?.clientId;
        const name =
          kind === 'client'
            ? (r?.name ?? r?.clientName ?? r?.companyName ?? `Client ${String(id).slice(0, 8)}`)
            : (r?.name ?? r?.fullName ?? r?.email ?? `User ${String(id).slice(0, 8)}`);
        return id ? { id: String(id), name: String(name) } : null;
      })
      .filter(Boolean) as Option[];
  }

  private normalizeAssignments(rows: any): PayrollAssignment[] {
    const arr = Array.isArray(rows) ? rows : (rows?.data ?? []);
    return (arr || [])
      .filter(Boolean)
      .map((r: any) => ({
        id: String(r?.id ?? ''),
        clientId: String(r?.clientId ?? r?.client_id ?? ''),
        payrollUserId: String(r?.payrollUserId ?? r?.payroll_user_id ?? ''),
        startDate: r?.startDate ?? r?.start_date ?? null,
        endDate: r?.endDate ?? r?.end_date ?? null,
        status: r?.status ?? 'ACTIVE',
      }))
      .filter((a: PayrollAssignment) => !!a.id && !!a.clientId && !!a.payrollUserId);
  }

  clientName(clientId: string): string {
    return this.clients.find((c) => c.id === clientId)?.name || clientId;
  }

  payrollUserName(userId: string): string {
    return this.payrollUsers.find((u) => u.id === userId)?.name || userId;
  }

  private rebuildSelectOptions(): void {
    this.clientSelectOptions = [
      { value: null, label: '-- Select Client --' },
      ...this.clients.map((c) => ({ value: c.id, label: c.name })),
    ];

    this.payrollUserSelectOptions = [
      { value: null, label: '-- Select Payroll User --' },
      ...this.payrollUsers.map((u) => ({ value: u.id, label: u.name })),
    ];
  }

  canAssign(): boolean {
    return !!this.form.clientId && !!this.form.payrollUserId;
  }

  assign(): void {
    if (!this.canAssign()) {
      this.toast.warning('Please select both Client and Payroll User.');
      return;
    }

    const clientId = this.form.clientId!;
    const payrollUserId = this.form.payrollUserId!;

    this.loading = true;
    const sub = this.api
      .createAssignment({ clientId, payrollUserId })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.success('Payroll assignment saved');
          this.loadAll();
        },
        error: (err) => {
          console.error('Assign payroll error', err);
          this.toast.error(err?.error?.message || 'Failed to create payroll assignment');
          this.cdr.detectChanges();
        },
      });
    
    this.subscriptions.add(sub);
  }

  unassign(assignment: PayrollAssignment): void {
    if (!assignment?.clientId) return;
    this.loading = true;
    const sub = this.api
      .unassign(assignment.clientId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.success('Payroll assignment removed');
          this.loadAll();
        },
        error: (err) => {
          console.error('Unassign payroll error', err);
          this.toast.error(err?.error?.message || 'Failed to remove payroll assignment');
          this.cdr.detectChanges();
        },
      });
    
    this.subscriptions.add(sub);
  }
}
