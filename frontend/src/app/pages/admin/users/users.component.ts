import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, Observable, of, Subject, firstValueFrom } from 'rxjs';
import { catchError, finalize, timeout, takeUntil } from 'rxjs/operators';

import { AdminUsersApi, Role, UserDirectoryResponse, UserDto, UserRow } from '../../../core/api/admin-users.api';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  DataTableComponent,
  EmptyStateComponent,
  FormInputComponent,
  FormSelectComponent,
  PageHeaderComponent,
  SelectOption,
  StatusBadgeComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';

@Component({
  selector: 'app-users',
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
    FormInputComponent,
    FormSelectComponent,
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
})
export class UsersComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  // Form fields
  name = '';
  email = '';
  mobile = '';
  password = '';

  // State
  currentUserId: string | null = null;
  currentPage = 1;
  sortBy = 'id';
  sortDir = 'desc';
  totalPages = 1;
  pageSize = 10;
  totalCount = 0;
  roleId: string | null = null;
  clientId: string | null = null;
  ownerCcoId: string | null = null;
  msg = '';
  err = '';
  isLoading = false;
  actionUserId: string | null = null;

  // Data
  roles: Role[] = [];
  rolesLoading = false;
  users: UserDto[] = [];
  showCreateForm = false;
  ceoExists = false;
  ccoCount = 0;
  activeCcoCount = 0;
  clients: Array<{ id: string; clientName: string }> = [];
  clientsLoading = false;

  // Filters
  filterRoleCode: string | 'all' = 'all';
  searchTerm = '';
  filterStatus: 'all' | 'ACTIVE' | 'INACTIVE' = 'all';

  // Pagination options
  pageSizeOptions: number[] = [10, 20, 50, 100];

  // Table columns
  usersColumns: TableColumn[] = [
    { key: 'userCode', header: 'Code', sortable: true },
    { key: 'role', header: 'Role', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'mobile', header: 'Mobile' },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: 'Action', align: 'right' },
  ];

  constructor(
    public api: AdminUsersApi,
    public auth: AuthService,
    public router: Router,
    public toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  // Cached select options — rebuilt only when underlying data changes
  roleOptions: SelectOption[] = [];
  clientOptions: SelectOption[] = [];
  ccoOptions: SelectOption[] = [];
  roleFilterOptions: SelectOption[] = [];

  readonly sortOptions: SelectOption[] = [
    { value: 'id', label: 'Sort: ID' },
    { value: 'name', label: 'Sort: Name' },
    { value: 'email', label: 'Sort: Email' },
    { value: 'roleId', label: 'Sort: Role' },
    { value: 'status', label: 'Sort: Status' },
    { value: 'createdAt', label: 'Sort: Created' }
  ];

  readonly pageSizeSelectOptions: SelectOption[] = [10, 20, 50, 100].map(s => ({ value: s, label: s.toString() }));

  private rebuildRoleOptions(): void {
    const roleOptions = [
      { value: null as any, label: 'Select role' },
      ...this.roles.map(r => ({
        value: r.id,
        label: this.getRoleOptionLabel(r),
        disabled: (r['roleCode'] ?? r['code']) === 'CEO' && this.ceoExists ||
                  (r['roleCode'] ?? r['code']) === 'CCO' && this.ccoCount >= 5 ||
                  (r['roleCode'] ?? r['code']) === 'CRM' && this.activeCcoCount === 0
      }))
    ];
    const roleFilterOptions = [
      { value: 'all', label: 'All roles' },
      ...this.roles.map(r => ({
        value: r['roleCode'] ?? r['code'],
        label: this.getRoleDisplayName(r)
      }))
    ];

    this.deferUi(() => {
      this.roleOptions = roleOptions;
      this.roleFilterOptions = roleFilterOptions;
    });
  }

  private rebuildClientOptions(): void {
    this.clientOptions = [
      { value: null as any, label: 'Select company' },
      ...this.clients.map(c => ({ value: c.id, label: c.clientName }))
    ];
  }

  private rebuildCcoOptions(): void {
    this.ccoOptions = [
      { value: null as any, label: 'Select CCO' },
      ...this.ccoUsers.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }))
    ];
  }

  isAdminRow(u: UserRow): boolean {
    const code = (this.getRoleCodeForRow(u) || '').toUpperCase();
    return code === 'ADMIN';
  }

  isCeoRow(u: UserRow): boolean {
    const code = (this.getRoleCodeForRow(u) || '').toUpperCase();
    return code === 'CEO';
  }

  isSelf(u: UserRow): boolean {
    return this.currentUserId != null && u.id === this.currentUserId;
  }

  isProtectedRole(u: UserRow): boolean {
    const code = (this.getRoleCodeForRow(u) || '').toUpperCase();
    return code === 'ADMIN' || code === 'CEO';
  }

  private ensureProtectedActive(u: UserRow): UserRow {
    if (!this.isProtectedRole(u)) return u;
    return {
      ...u,
      isActive: true,
      status: 'ACTIVE',
    };
  }

  canModifyUser(u: UserRow): boolean {
    // Block actions on any ADMIN or CEO user or on yourself
    if (this.isProtectedRole(u)) return false;
    if (this.isSelf(u)) return false;
    return true;
  }

  onFiltersChanged(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  onSortChange(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.filterRoleCode = 'all';
    this.filterStatus = 'all';
    this.sortBy = 'id';
    this.sortDir = 'desc';
    this.currentPage = 1;
    this.loadUsers();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  prevPage(): void {
    if (this.currentPage <= 1) return;
    this.currentPage--;
    this.loadUsers();
  }

  nextPage(): void {
    if (this.currentPage >= this.totalPages) return;
    this.currentPage++;
    this.loadUsers();
  }

  goToPage(p: number): void {
    const page = Number(p);
    if (!Number.isFinite(page)) return;
    this.currentPage = Math.min(this.totalPages, Math.max(1, page));
    this.loadUsers();
  }



  go(path: string): void {
    this.router.navigateByUrl(path);
  }

  logout(): void {
    this.auth.logoutOnce('User logout');
  }

  ngOnInit(): void {
    const user = this.auth.getUser();
    this.currentUserId = user?.id ?? null;
    this.loadAll();
  }

  ngOnDestroy(): void {
    // Complete the destroy subject to unsubscribe from all observables
    this.destroy$.next();
    this.destroy$.complete();
  }

  private deferUi(fn: () => void): void {
    setTimeout(() => {
      fn();
      this.cdr.detectChanges();
    }, 0);
  }

  get showOwnerCcoSelector(): boolean {
    return this.isCrmRole;
  }

  loadClients(): void {
    this.clientsLoading = true;
    this.api
      .getAdminClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.clients = data || [];
          this.clientsLoading = false;
          this.rebuildClientOptions();
        },
        error: () => {
          this.clients = [];
          this.clientsLoading = false;
          this.rebuildClientOptions();
        },
      });
  }

  // Convenience: CCO dropdown data is loaded via users endpoint with role filter
  ccoUsers: Array<{ id: string; name: string; email: string }> = [];
  ccoLoading = false;

  private loadCcoUsers(): void {
    if (!this.showOwnerCcoSelector) {
      this.ccoUsers = [];
      return;
    }

    this.ccoLoading = true;
    this.api
      .getCcoUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.ccoUsers = (rows || []).map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          }));
          this.ccoLoading = false;
          this.rebuildCcoOptions();
        },
        error: () => {
          this.ccoUsers = [];
          this.ccoLoading = false;
          this.rebuildCcoOptions();
        },
      });
  }

  get selectedRoleCode(): string | null {
    if (!this.roleId) return null;
    const role = this.roles.find(r => r.id === this.roleId);
    return role?.['code'] || null;
  }

  get isClientRole(): boolean {
    // Company selection is required for CLIENT and CONTRACTOR users
    return this.selectedRoleCode === 'CLIENT' || this.selectedRoleCode === 'CONTRACTOR';
  }

  get isCrmRole(): boolean {
    return this.selectedRoleCode === 'CRM';
  }

  onRoleChanged(): void {
    // When switching away from CLIENT/CONTRACTOR, clear any previously selected company
    if (!this.isClientRole) {
      this.clientId = null;
    }

    // When switching away from CRM, clear previously selected owner CCO
    if (!this.isCrmRole) {
      this.ownerCcoId = null;
      this.ccoUsers = [];
      this.rebuildCcoOptions();
    } else {
      // When switching to CRM, load available CCO owners
      this.loadCcoUsers();
    }
  }

  private getRoleCodeForRow(u: UserRow): string | null {
    const anyU = u as any;
    const rawCode = anyU.roleCode || anyU.role_code || anyU.rolecode;
    if (rawCode) {
      return String(rawCode);
    }
    const role = this.roles.find((r) => r.id === u.roleId);
    return role?.['code'] || null;
  }

  getCompanyForUser(u: UserRow): string {
    const code = this.getRoleCodeForRow(u);
    if (code === 'CLIENT' || code === 'CONTRACTOR') {
      return (u.client && u.client.name) || '-';
    }
    return '-';
  }

  getBranchesForUser(u: UserRow): string {
    const branches = u.branches || [];
    if (!branches.length) return '-';
    // Show first 2 and aggregate the rest
    if (branches.length <= 2) {
      return branches.map((b) => b.name).join(', ');
    }
    const firstTwo = branches.slice(0, 2).map((b) => b.name).join(', ');
    const remaining = branches.length - 2;
    return `${firstTwo} +${remaining}`;
  }

  loadAll(): void {
    this.msg = '';
    this.err = '';
    this.rolesLoading = true;
    this.clientsLoading = true;
    this.ccoLoading = true;

    // Load users immediately — don't wait for setup data
    this.loadUsers();

    // Load setup data (roles, clients, CCOs) in parallel for the Create User form
    const guard = <T>(obs: Observable<T>, fallback: T): Observable<T> =>
      obs.pipe(timeout(20000), catchError(() => of(fallback)));

    forkJoin({
      roles: guard(this.api.getRoles(), []),
      clients: guard(this.api.getAdminClients(), []),
      activeCcos: guard(this.api.getActiveUsersByRole('CCO'), []),
      activeCeos: guard(this.api.getActiveUsersByRole('CEO'), []),
    })
      .pipe(
        catchError(() => of({ roles: [] as Role[], clients: [] as any[], activeCcos: [] as any[], activeCeos: [] as any[] })),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ({ roles, clients, activeCcos, activeCeos }) => {
          this.roles = roles || [];
          this.clients = clients || [];

          const ccos = Array.isArray(activeCcos) ? activeCcos : [];
          const ceos = Array.isArray(activeCeos) ? activeCeos : [];

          this.activeCcoCount = ccos.length;
          this.ccoCount = ccos.length;
          this.ceoExists = ceos.length > 0;

          this.rolesLoading = false;
          this.clientsLoading = false;
          this.ccoLoading = false;

          this.rebuildRoleOptions();
          this.rebuildClientOptions();
        },
        error: (e: any) => {
          this.err = e?.error?.message || 'Failed to load user setup data';
          this.roles = [];
          this.clients = [];
          this.ceoExists = false;
          this.ccoCount = 0;
          this.activeCcoCount = 0;
          this.rolesLoading = false;
          this.clientsLoading = false;
          this.ccoLoading = false;
          this.rebuildRoleOptions();
          this.rebuildClientOptions();
        },
      });
  }


  // Removed duplicate declarations for users, groupByClient, page, limit, total, loading

  async loadUsers(): Promise<void> {
    this.isLoading = true;

    const params: Record<string, string> = {
      page: String(this.currentPage),
      limit: String(this.pageSize),
      search: this.searchTerm || '',
      roleCode: this.filterRoleCode || 'all',
      status: this.filterStatus || 'all',
    };

    const startedAt = Date.now();
    const safetyTimer = setTimeout(() => {
      if (this.isLoading) {
        console.warn('[UsersComponent] loadUsers safety timeout fired');
        this.isLoading = false;
      }
    }, 8000);

    try {
      const res = await firstValueFrom(
        this.api.getUserDirectory(params).pipe(
          timeout(15000),
          catchError((err) => {
            console.error('[UsersComponent] loadUsers HTTP error:', err);
            this.err = err?.error?.message || 'Failed to load users';
            return of({ items: [], total: 0 });
          }),
        ),
      );

      console.log('[UsersComponent] directory response', res);

      const items = Array.isArray(res?.items) ? res.items : [];
      const filtered = items.filter((u: any) => !this.isDeletedUser(u));
      this.users = filtered.map((u: any) => this.ensureProtectedActive(this.normalizeUserRow(u)));
      this.totalCount = typeof res?.total === 'number' ? res.total : 0;
      this.totalPages = Math.max(1, Math.ceil(this.totalCount / this.pageSize));
      this.cdr.detectChanges();
    } finally {
      clearTimeout(safetyTimer);
      this.isLoading = false;
      const duration = Date.now() - startedAt;
      console.log(`[UsersComponent] loadUsers completed in ${duration}ms`);
      this.cdr.detectChanges();
    }
  }

  private normalizeUserRow(u: any): UserRow {
    const isActiveRaw = u?.isActive ?? u?.isactive ?? u?.is_active;
    const isActive = isActiveRaw === true || isActiveRaw === 'true' || isActiveRaw === 1 || isActiveRaw === '1';
    return {
      ...u,
      isActive,
      status: u?.status || (isActive ? 'ACTIVE' : 'INACTIVE'),
    } as UserRow;
  }

  private isDeletedUser(u: any): boolean {
    const status = (u?.status || '').toString().toUpperCase();
    const isDeletedFlag = u?.isDeleted ?? u?.deleted ?? u?.is_deleted ?? false;
    const hasDeletedAt = Boolean(u?.deletedAt ?? u?.deleted_at);
    return status === 'DELETED' || isDeletedFlag === true || isDeletedFlag === 'true' || isDeletedFlag === 1 || hasDeletedAt;
  }


  create(): void {
    this.msg = '';
    this.err = '';

    if (!this.roleId) {
      this.err = 'Please select a role';
      return;
    }
    if (this.isCrmRole && !this.ownerCcoId) {
      this.err = 'Please select an owner CCO for CRM user';
      return;
    }
    if (this.isClientRole && !this.clientId) {
      this.err = 'Please select a company for this role';
      return;
    }
    if (!this.name.trim()) {
      this.err = 'Name is required';
      return;
    }
    if (!this.email.trim()) {
      this.err = 'Email is required';
      return;
    }
    const trimmedEmail = this.email.trim();
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      this.err = 'Please enter a valid email address';
      return;
    }
    if (!this.password) {
      this.err = 'Password is required';
      return;
    }
    if (this.password.length < 6) {
      this.err = 'Password must be at least 6 characters';
      return;
    }

    this.isLoading = true;

    const payload = {
      roleId: this.roleId!,
      clientId: this.isClientRole ? this.clientId || undefined : undefined,
      ownerCcoId: this.isCrmRole ? this.ownerCcoId || undefined : undefined,
      name: this.name.trim(),
      email: trimmedEmail,
      mobile: this.mobile?.trim() || undefined,
      password: this.password,
    };

    this.api
      .createUser(payload)
      .pipe(
        timeout(10000),
        takeUntil(this.destroy$),
        finalize(() => (this.isLoading = false)),
      )
      .subscribe({
        next: (res: any) => {
          this.msg = 'User created successfully';

          // Optimistically show the new user immediately in the current list
          const createdId = typeof res?.id === 'string' ? res.id : '';
          const role = this.roles.find(r => r.id === payload.roleId);
          const newUser: UserRow = {
            id: createdId,
            roleId: payload.roleId!,
            name: payload.name,
            email: payload.email,
            mobile: payload.mobile ?? null,
            isActive: true,
            createdAt: new Date().toISOString(),
            roleCode: String(role?.['code'] ?? ''),
          };

          this.users = [newUser, ...this.users];
          this.totalCount = (this.totalCount || 0) + 1;

          this.clearForm();

          // Refresh from server so paging/sorting stay correct
          this.loadUsers();
        },
        error: (e: any) => {
          // Show backend error in UI for clarity
          alert(e?.error?.message || 'Failed to create user');
          this.err = e?.error?.message || 'Failed to create user';
        },
      });
  }


  deleteUser(u: UserRow): void {
    if (this.actionUserId) return;
    if (!this.canModifyUser(u)) {
      this.err = 'You cannot delete this user.';
      return;
    }

    this.msg = '';
    this.err = '';
    if (!confirm(`Delete user #${u.id} (${u.email})? This cannot be undone.`)) return;
    // Optimistically remove from UI so it disappears immediately
    const previousUsers = this.users;
    this.users = this.users.filter((row) => row.id !== u.id);
    this.totalCount = Math.max(0, (this.totalCount || 0) - 1);

    this.actionUserId = u.id;
    this.isLoading = true;
    this.api
      .deleteUser(u.id)
      .pipe(
        timeout(10000),
        takeUntil(this.destroy$),
        finalize(() => (this.isLoading = false)),
      )
      .subscribe({
        next: () => {
          this.actionUserId = null;
          this.msg = 'User deleted';
          this.toast.success('User deleted');
        },
        error: (e: any) => {
          this.actionUserId = null;
          // Restore list if delete failed
          this.users = previousUsers;
          this.totalCount = previousUsers.length;
          this.err = e?.error?.message || 'Failed to delete user';
        },
    });
  }


  toggle(u: UserRow): void {
    if (this.actionUserId) return;
    if (!this.canModifyUser(u)) {
      this.err = 'You cannot change this user status.';
      return;
    }

    this.msg = '';
    this.err = '';

    const nextStatus = !u.isActive;

    // Optimistically update UI immediately
    const previousStatus = u.isActive;
    u.isActive = nextStatus;
    this.actionUserId = u.id;

    this.api
      .updateUserStatus(u.id, nextStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionUserId = null;
          this.deferUi(() => {
            this.msg = `User ${nextStatus ? 'activated' : 'deactivated'} successfully`;
          });
        },
        error: (e: any) => {
          this.actionUserId = null;
          // Revert on failure so UI stays consistent with server
          u.isActive = previousStatus;
          this.err = e?.error?.message || 'Failed to update user';
        },
      });
  }

  clearForm(): void {
    this.roleId = null;
    this.clientId = null;
    this.ownerCcoId = null;
    this.name = '';
    this.email = '';
    this.mobile = '';
    this.password = '';
  }

  roleLabel(roleId: string): string {
    const r = this.roles.find((x) => x.id === roleId);
    if (!r) return `Role ${roleId}`;
    const code = r['roleCode'] ?? r['code'];
    const displayName = code === 'CLIENT' ? 'Client User' : r.name;
    return `${code} - ${displayName}`;
  }

  // Accepts Role or UserDto
  getRoleDisplayName(role: Role | UserDto): string {
    const code = role['roleCode'] ?? role['code'];
    const displayName = code === 'CLIENT' ? 'Client User' : role.name;
    return `${code} - ${displayName}`;
  }

  /**
   * HTML <option> cannot render nested elements like <span>.
   * Keep the label as plain text to avoid dropdown layout issues.
   */
  getRoleOptionLabel(r: Role): string {
    const code = (r['roleCode'] ?? r['code']) as string;
    let suffix = '';
    if (code === 'CEO' && this.ceoExists) suffix = ' (Already exists)';
    if (code === 'CCO' && this.ccoCount >= 5) suffix = ' (Limit reached)';
    if (code === 'CRM' && this.activeCcoCount === 0) suffix = ' (No active CCOs)';
    return `${this.getRoleDisplayName(r)}${suffix}`;
  }

  getRoleLabelForRow(u: UserDto | Role): string {
    const code = u['roleCode'] ?? u['code'];
    return code || '—';
  }

  // TrackBy for Role[] (not UserDto[])
  trackByRoleId(_: number, r: Role) {
    return r.id ?? r['code'] ?? r['roleCode'];
  }

  // Derived helpers
  get currentPageCount(): number {
    return this.users.length;
  }



  isCeoRoleDisabled(): boolean {
    const ceoRole = this.roles.find(r => (r['roleCode'] ?? r['code']) === 'CEO');
    return !!this.ceoExists && !!ceoRole;
  }
  isCcoRoleDisabled(): boolean {
    const ccoRole = this.roles.find(r => (r['roleCode'] ?? r['code']) === 'CCO');
    return this.ccoCount >= 5 && !!ccoRole;
  }
  isCrmRoleDisabled(): boolean {
    const crmRole = this.roles.find(r => (r['roleCode'] ?? r['code']) === 'CRM');
    return this.activeCcoCount === 0 && !!crmRole;
  }
}
