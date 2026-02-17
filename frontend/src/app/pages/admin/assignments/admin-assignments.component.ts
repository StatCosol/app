import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, timeout, finalize } from 'rxjs/operators';
import { AdminAssignmentsService, CreateAssignmentPayload, Assignment } from './admin-assignments.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  EmptyStateComponent,
  FormSelectComponent,
  TableColumn,
  SelectOption
} from '../../../shared/ui';

type NamedOption = { id: string; name: string; meta?: Record<string, any> };

@Component({
  selector: 'app-admin-assignments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    EmptyStateComponent,
    FormSelectComponent
  ],
  templateUrl: './admin-assignments.component.html',
  styleUrls: ['./admin-assignments.component.scss']
})
export class AdminAssignmentsComponent implements OnInit {
  private service = inject(AdminAssignmentsService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  clients: NamedOption[] = [];
  crms: NamedOption[] = [];
  auditors: NamedOption[] = [];
  clientSelectOptions: SelectOption[] = [];
  crmSelectOptions: SelectOption[] = [];
  auditorSelectOptions: SelectOption[] = [];
  currentAssignments: Assignment[] = [];
  assignmentHistory: Assignment[] = [];
  assignmentByClientId: Record<string, Assignment> = {};

  // Precomputed maps for performance
  clientNameById: Record<string, string> = {};
  userNameById: Record<string, string> = {};

  loading = false;
  removingClientId: string | null = null;
  historyLoading = false;
  error = '';
  isEditMode = false;
  editingClientId: string | null = null;

  form = {
    clientId: null as string | null,
    crmId: null as string | null,
    auditorId: null as string | null,

  };

  // Table columns
  currentAssignmentsColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'crmName', header: 'CRM', sortable: true },
    { key: 'auditorName', header: 'Auditor', sortable: true },
    { key: 'startDate', header: 'Start Date', sortable: true },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions', align: 'right' }
  ];

  historyColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client' },
    { key: 'crmName', header: 'CRM' },
    { key: 'auditorName', header: 'Auditor' },
    { key: 'startDate', header: 'Start Date' },
    { key: 'endDate', header: 'End Date' },
    { key: 'status', header: 'Status' }
  ];

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    this.error = '';

    const handleLoadError = (label: string) => (err: unknown) => {
      console.error(`${label} load error`, err);
      if (!this.error) {
        this.error = `Some data failed to load (${label})`;
      }
      return of([]);
    };

    forkJoin({
      clients: this.service.getClients().pipe(
        timeout(8000),
        catchError(handleLoadError('Clients'))
      ),
      crms: this.service.getCrms().pipe(
        timeout(8000),
        catchError(handleLoadError('CRMs'))
      ),
      auditors: this.service.getAuditors().pipe(
        timeout(8000),
        catchError(handleLoadError('Auditors'))
      ),
      current: this.service.getCurrentAssignments().pipe(
        timeout(8000),
        catchError(handleLoadError('Current assignments')),
      ),
    }).pipe(
      finalize(() => {
        this.loading = false;
        // Force change detection in case the initial render coalesced updates
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: ({ clients, crms, auditors, current }) => {
        this.clients = this.toClientOptions(clients);
        this.crms = this.toUserOptions(crms, 'CRM');
        this.auditors = this.toUserOptions(auditors, 'AUDITOR');
        this.currentAssignments = this.normalizeCurrentAssignments(this.toArray(current));
        this.buildAssignmentMap();
        this.rebuildSelectOptions();
        
        // Build name maps for template performance
        this.buildNameMaps();
      },
      error: (err) => {
        console.error('Load error:', err);
        this.error = 'Failed to load data';
      },
    });

    this.historyLoading = true;
    this.service.getAssignmentHistory().pipe(
      timeout(8000),
      catchError((err) => {
        console.error('History load error:', err);
        return of([]);
      }),
      finalize(() => {
        this.historyLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (history) => {
        this.assignmentHistory = this.normalizeHistory(this.toArray(history));
      },
    });
  }

  private toArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value;
    }
    const container = value as {
      data?: T[];
      items?: T[];
      result?: T[];
      clients?: T[];
      users?: T[];
    };
    const nested =
      container?.data ??
      container?.items ??
      container?.result ??
      container?.clients ??
      container?.users;
    return Array.isArray(nested) ? nested : [];
  }

  private toClientOptions(res: unknown): NamedOption[] {
    const arr = this.toArray<any>(res);

    if (!arr || arr.length === 0) {
      return [];
    }

    const mapped = arr.map((item: any) => {
      const id = String(item?.id ?? '');
      const name = item?.clientName || `Client #${id}`;
      
      return {
        id,
        name: `${name}${item?.clientCode ? ' [' + item.clientCode + ']' : ''}`,
        meta: { clientName: name, clientCode: item?.clientCode },
      } as NamedOption;
    }).filter((client): client is NamedOption => Boolean(client && client.id != null));

    return mapped.sort((a, b) => a.name.localeCompare(b.name));
  }

  private toUserOptions(payload: unknown, role: 'CRM' | 'AUDITOR'): NamedOption[] {
    const container = payload as {
      data?: unknown[];
      users?: unknown[];
      result?: unknown[];
      items?: unknown[];
    };
    const raw = Array.isArray(payload)
      ? payload
      : container?.data ??
        container?.users ??
        container?.result ??
        container?.items ??
        [];
    const targetRole = role.toUpperCase();
    return (raw || [])
      .filter(
        (user: any) =>
          String(user?.roleCode ?? user?.role ?? user?.roleName ?? '')
            .toUpperCase() === targetRole,
      )
      .map((user: any) => {
        const id = String(user?.id ?? user?.userId ?? '');
        const name = (
          user?.name ??
          user?.fullName ??
          user?.displayName ??
          user?.email ??
          ''
        )
          .toString()
          .trim();
        return { id, name } as NamedOption;
      })
      .filter((user: NamedOption) => user.id != null && user.name.length > 0);
  }

  private buildNameMaps() {
    // Build client name map
    this.clientNameById = {};
    this.clients.forEach(c => {
      if (c.id) {
        this.clientNameById[c.id] = ((c.meta as any)?.['clientName']) ?? c.name;
      }
    });

    // Build user name map (crms + auditors)
    this.userNameById = {};
    this.crms.forEach(u => {
      if (u.id) {
        this.userNameById[u.id] = u.name;
      }
    });
    this.auditors.forEach(u => {
      if (u.id) {
        this.userNameById[u.id] = u.name;
      }
    });
  }

  private rebuildSelectOptions() {
    this.clientSelectOptions = [
      { value: null as any, label: 'Select Client' },
      ...this.clients.map(c => ({ value: c.id, label: c.name })),
    ];

    this.crmSelectOptions = [
      { value: null as any, label: 'Select CRM (optional)' },
      ...this.crms.map(c => ({ value: c.id, label: c.name })),
    ];

    this.auditorSelectOptions = [
      { value: null as any, label: 'Select Auditor (optional)' },
      ...this.auditors.map(a => ({ value: a.id, label: a.name })),
    ];
  }

  private buildAssignmentMap() {
    this.assignmentByClientId = {};
    this.currentAssignments.forEach((a) => {
      if (a?.clientId) {
        const key = String(a.clientId);
        this.assignmentByClientId[key] = a;
      }
    });
  }

  getUserName(userId?: string | null): string {
    if (!userId) return '—';
    return this.userNameById[userId] ?? `User #${userId}`;
  }

  getStatus(row: { crmId?: string | null; auditorId?: string | null; crm?: string | null; auditor?: string | null }): string {
    const crmId = row.crmId ?? row.crm;
    const auditorId = row.auditorId ?? row.auditor;
    return crmId || auditorId ? 'ASSIGNED' : 'PENDING';
  }

  private normalizeCurrentAssignments(rows: any[]): any[] {
    return rows.map((row) => {
      const clientId = row?.clientId ?? row?.client_id ?? row?.client?.id ?? '';
      const crmId = row?.crmId ?? row?.crm ?? row?.crm_id ?? null;
      const auditorId = row?.auditorId ?? row?.auditor ?? row?.auditor_id ?? null;
      return {
        clientId,
        crmId,
        auditorId,
        crm: crmId,
        auditor: auditorId,
        startDate: row?.startDate ?? row?.start_date ?? row?.createdAt ?? row?.updatedAt ?? null,
        status: row?.status ?? this.getStatus({ crmId, auditorId }),
      };
    });
  }

  private normalizeHistory(rows: any[]): any[] {
    return rows.map((row) => {
      const assignmentType = row?.assignmentType ?? row?.assignment_type;
      const assignedId = row?.assignedToUserId ?? row?.assigned_to_user_id ?? null;

      return {
        clientId: row?.clientId ?? row?.client_id ?? row?.client?.id ?? '',
        crmId: assignmentType === 'CRM' ? assignedId : null,
        auditorId: assignmentType === 'AUDITOR' ? assignedId : null,
        crm: assignmentType === 'CRM' ? assignedId : null,
        auditor: assignmentType === 'AUDITOR' ? assignedId : null,
        startDate: row?.startDate ?? row?.start_date ?? null,
        endDate: row?.endDate ?? row?.end_date ?? null,
        status: row?.status ?? this.getStatus({ crmId: assignmentType === 'CRM' ? assignedId : null, auditorId: assignmentType === 'AUDITOR' ? assignedId : null }),
      };
    });
  }

  remove(row: any) {
    if (this.removingClientId) return;
    if (!row?.clientId) return;
    this.removingClientId = String(row.clientId);
    this.loading = true;
    this.service.unassignClient(row.clientId).subscribe({
      next: () => {
        this.removingClientId = null;
        if (this.editingClientId === String(row.clientId)) {
          this.resetForm();
        }
        this.loadAll();
      },
      error: (err) => {
        this.removingClientId = null;
        console.error('Unassign failed', err);
        this.loading = false;
      },
    });
  }

  assign() {
    if (!this.form.clientId) {
      this.toast.warning('Select a client');
      return;
    }
    if (!this.form.crmId && !this.form.auditorId) {
      this.toast.warning('Select CRM or Auditor');
      return;
    }

    const clientId = this.form.clientId;

    // Block accidental duplicate assign when not editing
    if (!this.isEditMode && this.assignmentByClientId[clientId]) {
      this.toast.warning('Client already has an assignment. Use Edit to update.');
      return;
    }

    const crmPayload = this.isEditMode ? this.form.crmId ?? null : this.form.crmId ?? undefined;
    const auditorPayload = this.isEditMode ? this.form.auditorId ?? null : this.form.auditorId ?? undefined;

    const payload: CreateAssignmentPayload = {
      clientId,
      crmId: crmPayload,
      auditorId: auditorPayload,
    };

    this.loading = true;
    this.error = '';
    const request$ = this.isEditMode && this.editingClientId
      ? this.service.updateAssignment(this.editingClientId, payload)
      : this.service.createAssignment(payload);

    request$.subscribe({
      next: () => {
        this.toast.success(this.isEditMode ? 'Assignment updated successfully' : 'Assignment created successfully');
        this.resetForm();
        this.loadAll();
      },
      error: (err) => {
        console.error('Assignment error:', err);
        if (err?.status === 409) {
          const msg = err?.error?.message || 'Already assigned';
          this.toast.warning(msg);
          this.loading = false;
          return;
        }
        this.error = err?.error?.message || 'Failed to create assignment';
        this.toast.error(this.error);
        this.loading = false;
      },
    });
  }

  resetForm() {
    this.form = {
      clientId: null,
      crmId: null,
      auditorId: null,
    };
    this.isEditMode = false;
    this.editingClientId = null;
  }

  trackById(_index: number, item: any) {
    return item?.id ?? _index;
  }

  // ------- Edit/Delete support (Admin Assignments) -------

  openEdit(row: any): void {
    if (!row?.clientId) return;
    this.isEditMode = true;
    this.editingClientId = String(row.clientId);
    this.form = {
      clientId: String(row.clientId),
      crmId: row.crmId ?? row.crm ?? null,
      auditorId: row.auditorId ?? row.auditor ?? null,
    };
    this.toast.info('Editing assignment. Update CRM/Auditor and click Update.');
  }
}

