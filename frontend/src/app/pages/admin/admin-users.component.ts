import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ToastService } from '../../shared/toast/toast.service';

interface AdminUserItem {
  id: string;
  name?: string;
  fullName?: string;
  email: string;
  role: string;
  active?: boolean;
  isActive?: boolean;
  createdAt?: string;
}

interface UserPayload {
  fullName: string;
  email: string;
  role: string;
  password?: string;
  isActive: boolean;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="page-card">
      <div class="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage system users and role allocation.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="secondary-btn" (click)="loadUsers()">
            Refresh
          </button>
          <button type="button" class="primary-btn" (click)="openCreateDrawer()">
            Add User
          </button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-label">Total Users</span>
          <strong>{{ users.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Active Users</span>
          <strong>{{ activeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Inactive Users</span>
          <strong>{{ inactiveCount }}</strong>
        </div>
      </div>

      <div *ngIf="loading" class="state-box">Loading users...</div>
      <div *ngIf="error" class="state-box error">{{ error }}</div>

      <div class="table-wrap" *ngIf="!loading && !error">
        <table class="data-table" *ngIf="users.length; else noUsers">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let user of users">
              <td>{{ user.fullName || user.name || '-' }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.role }}</td>
              <td>
                <span
                  class="badge"
                  [class.badge-success]="isUserActive(user)"
                  [class.badge-danger]="!isUserActive(user)"
                >
                  {{ isUserActive(user) ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>{{ user.createdAt ? (user.createdAt | date:'dd-MMM-yyyy') : '-' }}</td>
              <td class="text-right">
                <button type="button" class="table-btn" (click)="openEditDrawer(user)">
                  Edit
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #noUsers>
          <div class="state-box">No users found.</div>
        </ng-template>
      </div>
    </section>

    <div class="drawer-backdrop" *ngIf="drawerOpen" (click)="closeDrawer()"></div>

    <aside class="drawer" [class.drawer-open]="drawerOpen">
      <div class="drawer-header">
        <div>
          <h3>{{ editingUserId ? 'Edit User' : 'Create User' }}</h3>
          <p>{{ editingUserId ? 'Update user details and role.' : 'Add a new system user.' }}</p>
        </div>
        <button type="button" class="icon-btn" (click)="closeDrawer()">×</button>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="drawer-form">
        <div class="form-group">
          <label for="fullName">Full Name</label>
          <input id="fullName" type="text" formControlName="fullName" class="form-control" />
          <div class="field-error" *ngIf="showError('fullName', 'required')">
            Full name is required.
          </div>
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <input id="email" type="email" formControlName="email" class="form-control" />
          <div class="field-error" *ngIf="showError('email', 'required')">
            Email is required.
          </div>
          <div class="field-error" *ngIf="showError('email', 'email')">
            Enter a valid email address.
          </div>
        </div>

        <div class="form-group">
          <label for="role">Role</label>
          <select id="role" formControlName="role" class="form-control">
            <option *ngFor="let role of roles" [value]="role">{{ role }}</option>
          </select>
          <div class="field-error" *ngIf="showError('role', 'required')">
            Role is required.
          </div>
        </div>

        <div class="form-group" *ngIf="!editingUserId">
          <label for="password">Password</label>
          <input id="password" type="password" formControlName="password" class="form-control" />
          <div class="field-error" *ngIf="showError('password', 'required')">
            Password is required.
          </div>
          <div class="field-error" *ngIf="showError('password', 'minlength')">
            Password must be at least 6 characters.
          </div>
        </div>

        <label class="toggle-row">
          <input type="checkbox" formControlName="isActive" />
          <span>Active User</span>
        </label>

        <div class="drawer-actions">
          <button type="button" class="secondary-btn" (click)="closeDrawer()">Cancel</button>
          <button type="submit" class="primary-btn" [disabled]="saving">
            {{ saving ? 'Saving...' : (editingUserId ? 'Update User' : 'Create User') }}
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
      .table-btn,
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
      .table-btn {
        background: #e2e8f0;
        color: #0f172a;
      }

      .icon-btn {
        width: 40px;
        height: 40px;
        padding: 0;
        background: #e2e8f0;
        color: #0f172a;
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

      .text-right {
        text-align: right !important;
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
export class AdminUsersComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);

  users: AdminUserItem[] = [];
  loading = false;
  saving = false;
  error = '';
  drawerOpen = false;
  editingUserId: string | null = null;

  readonly roles = [
    'ADMIN',
    'CRM',
    'AUDITOR',
    'CEO',
    'CCO',
    'CLIENT',
    'BRANCH_USER',
    'CONTRACTOR',
    'PAYROLL',
    'ESS',
  ];

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    role: ['CRM', [Validators.required]],
    password: ['', [Validators.minLength(6)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  get activeCount(): number {
    return this.users.filter((u) => this.isUserActive(u)).length;
  }

  get inactiveCount(): number {
    return this.users.filter((u) => !this.isUserActive(u)).length;
  }

  loadUsers(): void {
    this.loading = true;
    this.error = '';

    this.http
      .get<AdminUserItem[]>('/api/v1/users')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (response) => {
          this.users = Array.isArray(response) ? response : [];
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load users.';
          this.users = [];
        },
      });
  }

  openCreateDrawer(): void {
    this.editingUserId = null;
    this.form.reset({
      fullName: '',
      email: '',
      role: 'CRM',
      password: '',
      isActive: true,
    });
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(6)]);
    this.form.controls.password.updateValueAndValidity();
    this.drawerOpen = true;
  }

  openEditDrawer(user: AdminUserItem): void {
    this.editingUserId = user.id;
    this.form.reset({
      fullName: user.fullName || user.name || '',
      email: user.email,
      role: user.role,
      password: '',
      isActive: this.isUserActive(user),
    });
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.editingUserId = null;
    this.form.reset({
      fullName: '',
      email: '',
      role: 'CRM',
      password: '',
      isActive: true,
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: UserPayload = {
      fullName: raw.fullName,
      email: raw.email,
      role: raw.role,
      isActive: raw.isActive,
    };

    if (!this.editingUserId) {
      payload.password = raw.password;
    }

    this.saving = true;

    const request$ = this.editingUserId
      ? this.http.patch(`/api/v1/users/${this.editingUserId}`, payload)
      : this.http.post('/api/v1/users', payload);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.saving = false)),
      )
      .subscribe({
        next: () => {
          this.toastService.success(
            'User Saved',
            this.editingUserId ? 'User updated successfully.' : 'User created successfully.',
          );
          this.closeDrawer();
          this.loadUsers();
        },
        error: (err) => {
          this.toastService.error(
            'Save Failed',
            err?.error?.message || 'Failed to save user.',
          );
        },
      });
  }

  isUserActive(user: AdminUserItem): boolean {
    if (typeof user.isActive === 'boolean') return user.isActive;
    if (typeof user.active === 'boolean') return user.active;
    return true;
  }

  showError(
    controlName: 'fullName' | 'email' | 'role' | 'password',
    errorKey: string,
  ): boolean {
    const control = this.form.get(controlName);
    return !!control && control.touched && control.hasError(errorKey);
  }
}