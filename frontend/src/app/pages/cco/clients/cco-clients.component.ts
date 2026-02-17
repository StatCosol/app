import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { PageHeaderComponent } from '../../../shared/ui';
import { CcoClientsApi, ClientDto } from '../../../core/api/cco-clients.api';

type AssignState = { assignedCrmId: string | null; assignedAuditorId: string | null };

@Component({
  selector: 'app-cco-clients',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="CCO - Clients" description="Manage client assignments" icon="office-building"></ui-page-header>

      <section class="card">
        <h3>Create Client</h3>
        <div class="row">
          <label>Client Name</label>
          <input [(ngModel)]="createForm.clientName" placeholder="Enter client name" />
        </div>
        <div class="row">
          <label>Client Code</label>
          <input [(ngModel)]="createForm.clientCode" placeholder="Enter client code" />
        </div>
        <div class="row">
          <label>Status</label>
          <select (mousedown)="$event.stopPropagation()" (pointerdown)="$event.stopPropagation()" (click)="$event.stopPropagation()" [(ngModel)]="createForm.status">
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </div>

        <button (click)="createClient()" [disabled]="loading || !createForm.clientName || !createForm.clientCode">
          Create
        </button>

        <p class="error" *ngIf="error">{{ error }}</p>
      </section>

      <section class="card">
        <div class="header-row">
          <h3>Clients</h3>
          <button (click)="loadAll()" [disabled]="loading">Refresh</button>
        </div>

        <table class="tbl" *ngIf="clients.length; else empty">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Status</th>
              <th>Assigned CRM</th>
              <th>Assigned Auditor</th>
              <th>Assign</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of clients">
              <td>{{ c.clientName }}</td>
              <td>{{ c.clientCode }}</td>
              <td>{{ c.status }}</td>

              <td>
                <select (mousedown)="$event.stopPropagation()" (pointerdown)="$event.stopPropagation()" (click)="$event.stopPropagation()" [(ngModel)]="ensureState(c.id).assignedCrmId">
                  <option [ngValue]="null">-- Select CRM --</option>
                  <option *ngFor="let u of crmUsers" [ngValue]="u.id">
                    {{ u.name }} ({{ u.email }})
                  </option>
                </select>
              </td>

              <td>
                <select (mousedown)="$event.stopPropagation()" (pointerdown)="$event.stopPropagation()" (click)="$event.stopPropagation()" [(ngModel)]="ensureState(c.id).assignedAuditorId">
                  <option [ngValue]="null">-- Select Auditor --</option>
                  <option *ngFor="let u of auditorUsers" [ngValue]="u.id">
                    {{ u.name }} ({{ u.email }})
                  </option>
                </select>
              </td>

              <td>
                <button
                  (click)="assign(c)"
                  [disabled]="loading || !ensureState(c.id).assignedCrmId || !ensureState(c.id).assignedAuditorId"
                >
                  Save
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #empty>
          <p>No clients found.</p>
        </ng-template>

        <p class="error" *ngIf="error">{{ error }}</p>
      </section>
    </main>
  `,
  styles: [`
    .page { padding: 16px; max-width: 1100px; margin: 0 auto; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
    .row { display: grid; grid-template-columns: 160px 1fr; gap: 10px; align-items: center; margin-bottom: 10px; }
    input, select { padding: 8px; border: 1px solid #ccc; border-radius: 8px; }
    button { padding: 8px 12px; border-radius: 8px; border: 1px solid #999; background: #f6f6f6; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th, .tbl td { border-bottom: 1px solid #eee; padding: 10px; vertical-align: top; }
    .header-row { display: flex; align-items: center; justify-content: space-between; }
    .error { color: #b00020; margin-top: 10px; }
  `]
})
export class CcoClientsComponent implements OnInit {
  loading = false;
  error = '';

  clients: ClientDto[] = [];
  crmUsers: any[] = [];
  auditorUsers: any[] = [];

  createForm = {
    clientName: '',
    clientCode: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  };

  // per-client UI assignment
  assignState: Record<string, AssignState> = {};

  constructor(
    private clientsApi: CcoClientsApi,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ensureState(clientId: string): AssignState {
    if (!this.assignState[clientId]) {
      this.assignState[clientId] = { assignedCrmId: null, assignedAuditorId: null };
    }
    return this.assignState[clientId];
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.error = '';
    this.loading = true;

    this.clientsApi.listClients().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (clients) => {
        this.clients = clients ?? [];
        this.clients.forEach(c => {
          const state = this.ensureState(c.id);
          state.assignedCrmId = c.assignedCrmId ?? null;
          state.assignedAuditorId = c.assignedAuditorId ?? null;
        });

        // Load CRM users for dropdown
        this.http.get<any[]>('/api/cco/users/crms').subscribe({
          next: (users) => {
            this.crmUsers = users ?? [];
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.error = this.extractError(err) || 'Failed to load CRM users.';
            this.cdr.detectChanges();
          }
        });
        // Load auditor users for dropdown
        this.http.get<any[]>('/api/cco/users/auditors').subscribe({
          next: (users) => {
            this.auditorUsers = users ?? [];
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.error = this.extractError(err) || 'Failed to load auditor users.';
            this.cdr.detectChanges();
          }
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = this.extractError(err) || 'Failed to load clients.';
        this.cdr.detectChanges();
      }
    });
  }

  createClient() {
    this.error = '';
    this.loading = true;

    this.clientsApi.createClient({
      clientName: this.createForm.clientName.trim(),
      clientCode: this.createForm.clientCode.trim(),
      status: this.createForm.status,
    }).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.createForm.clientName = '';
        this.createForm.clientCode = '';
        this.createForm.status = 'ACTIVE';
        this.cdr.detectChanges();
        this.loadAll();
      },
      error: (err) => {
        this.error = this.extractError(err) || 'Failed to create client.';
        this.cdr.detectChanges();
      }
    });
  }

  assign(client: ClientDto) {
    this.error = '';
    this.loading = true;

    const state = this.ensureState(client.id);
    this.clientsApi.assignClient(client.id, {
      assignedCrmId: state.assignedCrmId!,
      assignedAuditorId: state.assignedAuditorId!,
    }).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => { this.cdr.detectChanges(); this.loadAll(); },
      error: (err) => {
        this.error = this.extractError(err) || 'Failed to assign.';
        this.cdr.detectChanges();
      }
    });
  }

  private extractError(err: any): string {
    // supports NestJS common error shapes
    return err?.error?.message?.toString?.() || err?.message || '';
  }
}
