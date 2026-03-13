import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ToastService } from '../../shared/toast/toast.service';

interface AdminClientItem {
  id: string;
  name: string;
  code?: string;
  state?: string;
  industry?: string;
  active?: boolean;
  isActive?: boolean;
  createdAt?: string;
}

interface ClientPayload {
  name: string;
  code: string;
  state: string;
  industry: string;
  isActive: boolean;
}

@Component({
  selector: 'app-admin-clients',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="page-card">
      <div class="page-header">
        <div>
          <h2>Clients</h2>
          <p>View registered master clients and current status.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="secondary-btn" (click)="loadClients()">
            Refresh
          </button>
          <button type="button" class="primary-btn" (click)="openDrawer()">
            Register Client
          </button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-label">Total Clients</span>
          <strong>{{ clients.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Active Clients</span>
          <strong>{{ activeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Inactive Clients</span>
          <strong>{{ inactiveCount }}</strong>
        </div>
      </div>

      <div *ngIf="loading" class="state-box">Loading clients...</div>
      <div *ngIf="error" class="state-box error">{{ error }}</div>

      <div class="table-wrap" *ngIf="!loading && !error">
        <table class="data-table" *ngIf="clients.length; else noClients">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Code</th>
              <th>State</th>
              <th>Industry</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let client of clients">
              <td>{{ client.name }}</td>
              <td>{{ client.code || '-' }}</td>
              <td>{{ client.state || '-' }}</td>
              <td>{{ client.industry || '-' }}</td>
              <td>
                <span
                  class="badge"
                  [class.badge-success]="isClientActive(client)"
                  [class.badge-danger]="!isClientActive(client)"
                >
                  {{ isClientActive(client) ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #noClients>
          <div class="state-box">No clients found.</div>
        </ng-template>
      </div>
    </section>

    <div class="drawer-backdrop" *ngIf="drawerOpen" (click)="closeDrawer()"></div>

    <aside class="drawer" [class.drawer-open]="drawerOpen">
      <div class="drawer-header">
        <div>
          <h3>Register Client</h3>
          <p>Create a new master client record.</p>
        </div>
        <button type="button" class="icon-btn" (click)="closeDrawer()">×</button>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="drawer-form">
        <div class="form-group">
          <label for="name">Client Name</label>
          <input id="name" type="text" formControlName="name" class="form-control" />
          <div class="field-error" *ngIf="showError('name', 'required')">
            Client name is required.
          </div>
        </div>

        <div class="form-group">
          <label for="code">Client Code</label>
          <input id="code" type="text" formControlName="code" class="form-control" />
          <div class="field-error" *ngIf="showError('code', 'required')">
            Client code is required.
          </div>
        </div>

        <div class="form-group">
          <label for="state">State</label>
          <select id="state" formControlName="state" class="form-control">
            <option value="">Select state</option>
            <option *ngFor="let state of states" [value]="state">{{ state }}</option>
          </select>
          <div class="field-error" *ngIf="showError('state', 'required')">
            State is required.
          </div>
        </div>

        <div class="form-group">
          <label for="industry">Industry</label>
          <input id="industry" type="text" formControlName="industry" class="form-control" />
          <div class="field-error" *ngIf="showError('industry', 'required')">
            Industry is required.
          </div>
        </div>

        <label class="toggle-row">
          <input type="checkbox" formControlName="isActive" />
          <span>Active Client</span>
        </label>

        <div class="drawer-actions">
          <button type="button" class="secondary-btn" (click)="closeDrawer()">Cancel</button>
          <button type="submit" class="primary-btn" [disabled]="saving">
            {{ saving ? 'Saving...' : 'Create Client' }}
          </button>
        </div>
      </form>
    </aside>
  `,
  styles: [
    `
      .page-card {
        margin-top: 20px;
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      }

      .page-header,
      .drawer-header,
      .drawer-actions,
      .header-actions {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .page-header {
        margin-bottom: 20px;
      }

      .page-header h2,
      .drawer-header h3 {
        margin: 0 0 6px;
        color: #0f172a;
      }

      .page-header p,
      .drawer-header p {
        margin: 0;
        color: #64748b;
      }

      .header-actions {
        align-items: center;
      }

      .primary-btn,
      .secondary-btn,
      .icon-btn {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .primary-btn {
        background: #2563eb;
        color: #fff;
      }

      .secondary-btn,
      .icon-btn {
        background: #e2e8f0;
        color: #0f172a;
      }

      .icon-btn {
        width: 40px;
        height: 40px;
        padding: 0;
        font-size: 22px;
      }

      .stats-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px;
      }

      .stat-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px;
      }

      .stat-label {
        display: block;
        color: #64748b;
        font-size: 13px;
        margin-bottom: 6px;
      }

      .state-box {
        padding: 14px 16px;
        border-radius: 12px;
        background: #f8fafc;
        color: #334155;
      }

      .state-box.error,
      .field-error {
        color: #b91c1c;
      }

      .state-box.error {
        background: #fef2f2;
      }

      .table-wrap {
        overflow: auto;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
      }

      .data-table th,
      .data-table td {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid #e2e8f0;
      }

      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }

      .badge-success {
        background: #dcfce7;
        color: #166534;
      }

      .badge-danger {
        background: #fee2e2;
        color: #991b1b;
      }

      .drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        z-index: 1000;
      }

      .drawer {
        position: fixed;
        top: 0;
        right: -440px;
        width: 420px;
        max-width: 100vw;
        height: 100vh;
        background: #fff;
        box-shadow: -12px 0 30px rgba(15, 23, 42, 0.16);
        z-index: 1001;
        transition: right 0.25s ease;
        padding: 20px;
        box-sizing: border-box;
        overflow: auto;
      }

      .drawer-open {
        right: 0;
      }

      .drawer-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: 20px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-control {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 11px 12px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .toggle-row {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #334155;
      }

      @media (max-width: 900px) {
        .stats-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminClientsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);

  clients: AdminClientItem[] = [];
  loading = false;
  saving = false;
  error = '';
  drawerOpen = false;

  readonly states = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka'];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    code: ['', [Validators.required]],
    state: ['', [Validators.required]],
    industry: ['', [Validators.required]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.loadClients();
  }

  get activeCount(): number {
    return this.clients.filter((c) => this.isClientActive(c)).length;
  }

  get inactiveCount(): number {
    return this.clients.filter((c) => !this.isClientActive(c)).length;
  }

  loadClients(): void {
    this.loading = true;
    this.error = '';

    this.http
      .get<AdminClientItem[]>('/api/v1/clients')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (response) => {
          this.clients = Array.isArray(response) ? response : [];
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load clients.';
          this.clients = [];
        },
      });
  }

  openDrawer(): void {
    this.form.reset({
      name: '',
      code: '',
      state: '',
      industry: '',
      isActive: true,
    });
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
  }

  submit(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: ClientPayload = this.form.getRawValue();
    this.saving = true;

    this.http
      .post('/api/v1/clients', payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.saving = false)),
      )
      .subscribe({
        next: () => {
          this.toastService.success('Client Created', 'Client registered successfully.');
          this.closeDrawer();
          this.loadClients();
        },
        error: (err) => {
          this.toastService.error(
            'Create Failed',
            err?.error?.message || 'Failed to create client.',
          );
        },
      });
  }

  isClientActive(client: AdminClientItem): boolean {
    if (typeof client.isActive === 'boolean') return client.isActive;
    if (typeof client.active === 'boolean') return client.active;
    return true;
  }

  showError(
    controlName: 'name' | 'code' | 'state' | 'industry',
    errorKey: string,
  ): boolean {
    const control = this.form.get(controlName);
    return !!control && control.touched && control.hasError(errorKey);
  }
}