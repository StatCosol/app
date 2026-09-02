import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, timeout, catchError } from 'rxjs/operators';
import { of, Subscription, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminClientsService, Client, Branch, BranchComplianceApplicability, ClientUserLink, ClientUserOption, BranchContractorLink, BranchUserLink, ContractorOption, AzureFaceBackfillResult, AzureFaceBackfillStatus } from './admin-clients.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../core/auth.service';
import { ServiceEntitlementsApiService, ServiceModuleOption } from '../../../core/service-entitlements.service';
import { INDIAN_STATES } from '../../../shared/utils/indian-states';
import {
  PageHeaderComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  FormInputComponent,
  FormSelectComponent,
  EmptyStateComponent,
  TableColumn,
  SelectOption,
} from '../../../shared/ui';

@Component({
  selector: 'app-admin-clients',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    FormInputComponent,
    FormSelectComponent,
    EmptyStateComponent
],
  templateUrl: './admin-clients.component.html',
  styleUrls: ['./admin-clients.component.scss']
})
export class AdminClientsComponent implements OnInit, OnDestroy {
  private service = inject(AdminClientsService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private routeSubscription?: Subscription;
  private readonly destroy$ = new Subject<void>();
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(ConfirmDialogService);
  private auth = inject(AuthService);
  private entitlementsApi = inject(ServiceEntitlementsApiService);

  // Client section
  clients: Client[] = [];
  selectedClient: Client | null = null;
  clientForm = {
    clientName: '',
    masterUserName: '',
    masterUserEmail: '',
    masterUserMobile: '',
    masterUserPassword: '',
    servicePackageCode: 'CUSTOM_SERVICES',
    serviceModules: ['EMPLOYEE_COMPLIANCE'],
    servicePackageNote: '',
  };
  serviceModuleOptions: ServiceModuleOption[] = [];
  showMasterPassword = false;
  createdMasterUser: { email: string; password: string } | null = null;
  regLogoFile: File | null = null;
  regLogoPreviewUrl: string | null = null;

  // Branch section
  branches: Branch[] = [];
  selectedBranch: Branch | null = null;
  branchForm: Branch = {
    branchName: '',
    branchType: 'HO',
    stateCode: null,
    address: '',
    headcount: 0,
    employeeCount: 0,
    contractorCount: 0,
    status: 'ACTIVE',
    branchUserName: '',
    branchUserEmail: '',
    branchUserMobile: '',
    branchUserPassword: ''
  };
  editingBranchId: string | null = null;

  createdBranchUser: { email: string; password: string | null; linkedExisting: boolean } | null = null;

  stateOptions = INDIAN_STATES;

  // Compliance section
  compliances: BranchComplianceApplicability[] = [];
  branchForCompliance: Branch | null = null;
  selectedComplianceIds = new Set<string>();
  selectedCount = 0;
  isSavingCompliances = false;
  complianceSaveMessage = '';
  complianceSaveError = '';

  // Client users section (link CLIENT users to company)
  clientUsers: ClientUserLink[] = [];
  availableClientUsers: ClientUserOption[] = [];
  selectedClientUserId: string | null = null;

  // Contractors per branch
  branchForContractors: Branch | null = null;
  branchContractors: BranchContractorLink[] = [];
  availableContractors: ContractorOption[] = [];
  selectedContractorUserId: string | null = null;

  // Branch desk users (login accounts) per branch
  branchForUsers: Branch | null = null;
  branchUsers: BranchUserLink[] = [];
  availableBranchUsers: ClientUserOption[] = [];
  selectedBranchUserId: string | null = null;
  linkingBranchUser = false;
  branchUserLinkError = '';
  branchUserResetResult: { email: string; newPassword: string } | null = null;
  resettingBranchUserId: string | null = null;

  // Branch save state
  isSavingBranch = false;
  branchSaveMessage = '';
  branchSaveError = '';
  branchUserErrorMessage = '';

  // Recompute state
  isRecomputing = false;

  // UI state
  activeTab: 'company' | 'branches' | 'compliances' = 'company';
  loading = true;
  error = '';
  success = '';

  // Client edit form
  editClientForm = {
    clientName: '',
    companyCode: '',
    industry: '',
    state: '',
    registeredAddress: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactMobile: '',
  };
  savingClient = false;
  loadingReadiness = false;
  readinessResult: any = null;
  azureBackfillStatus: AzureFaceBackfillStatus | null = null;
  azureBackfillResult: AzureFaceBackfillResult | null = null;
  loadingAzureBackfill = false;
  syncingAzureBackfill = false;
  azureBackfillError = '';

  // Master user edit state
  editingMasterUser: { userId: string; name: string; email: string; mobile: string } | null = null;
  savingMasterUser = false;
  masterUserResetResult: { newPassword: string } | null = null;

  // Logo upload state
  logoFile: File | null = null;
  logoPreviewUrl: string | null = null;
  uploadingLogo = false;
  logoUploadMessage = '';
  logoUploadError = '';

  // Table columns
  allClientsColumns: TableColumn[] = [
    { key: 'clientName', header: 'Company Name', sortable: true },
    { key: 'clientCode', header: 'Code' },
    { key: 'status', header: 'Status' },
    { key: 'branchesCount', header: 'Branches' },
    { key: 'totalEmployees', header: 'Total Employees' },
    { key: 'contractorsCount', header: 'Contract Employees' },
    { key: 'servicePackage', header: 'Services' },
    { key: 'actions', header: 'Actions', align: 'right' },
  ];

  clientUsersColumns: TableColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'createdAt', header: 'Linked At' },
    { key: 'action', header: 'Action', align: 'right' },
  ];

  branchesColumns: TableColumn[] = [
    { key: 'branchName', header: 'Branch Name', sortable: true },
    { key: 'branchType', header: 'Type' },
    { key: 'address', header: 'Address' },
    { key: 'employeeCount', header: 'On-Role Employees' },
    { key: 'contractorCount', header: 'Contract Employees' },
    { key: 'actions', header: 'Actions', align: 'right', width: '280px' },
  ];

  branchUserColumns: TableColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'isActive', header: 'Active' },
    { key: 'action', header: 'Action', align: 'right' },
  ];

  contractorColumns: TableColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'createdAt', header: 'Linked At' },
    { key: 'action', header: 'Action', align: 'right' },
  ];

  branchTypeOptions: SelectOption[] = [
    { value: 'HO', label: 'Head Office' },
    { value: 'ZONAL', label: 'Zonal Office' },
    { value: 'SALES', label: 'Sales Office' },
    { value: 'BRANCH', label: 'Branch Office' },
    { value: 'ESTABLISHMENT', label: 'Establishment' },
    { value: 'FACTORY', label: 'Factory' },
    { value: 'WAREHOUSE', label: 'Warehouse' },
    { value: 'SHOP', label: 'Shop' },
  ];

  readonly stateSelectOptions: SelectOption[] = this.stateOptions.map(s => ({ value: s.code, label: `${s.name} (${s.code})` }));

  contractorSelectOptions: SelectOption[] = [];
  clientUserSelectOptions: SelectOption[] = [];

  private rebuildContractorSelectOptions(): void {
    this.contractorSelectOptions = this.availableContractors.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }));
  }

  private rebuildClientUserSelectOptions(): void {
    this.clientUserSelectOptions = this.availableClientUsers.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }));
  }

  // ── Inline Field Validation Getters ──
  private _mobileError(v: string | undefined | null): string {
    const val = (v || '').trim();
    if (!val) return '';
    const cleaned = val.replace(/[\s-]/g, '');
    if (!/^\+\d{1,3}[6-9]\d{9}$/.test(cleaned)) return 'Mobile must include country code + 10 digits (e.g. +919876543210)';
    return '';
  }
  private _emailError(v: string | undefined | null): string {
    const val = (v || '').trim();
    if (!val) return '';
    if (!val.includes('@')) return 'Email must include @ symbol';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) return 'Please enter a valid email address';
    return '';
  }

  get masterUserEmailError(): string { return this._emailError(this.clientForm.masterUserEmail); }
  get masterUserMobileError(): string { return this._mobileError(this.clientForm.masterUserMobile); }
  get editMasterEmailError(): string { return this._emailError(this.editingMasterUser?.email); }
  get editMasterMobileError(): string { return this._mobileError(this.editingMasterUser?.mobile); }
  get contactEmailError(): string { return this._emailError(this.editClientForm.primaryContactEmail); }
  get contactMobileError(): string { return this._mobileError(this.editClientForm.primaryContactMobile); }
  get branchUserEmailError(): string { return this._emailError(this.branchForm.branchUserEmail); }
  get branchUserMobileError(): string { return this._mobileError(this.branchForm.branchUserMobile); }

  ngOnInit(): void {
    this.loadClients();
    this.loadCompliances();
    this.loadServiceModules();

    // Subscribe to route param changes (reactive)
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const clientId = params.get('id');
      const tab = params.get('tab');
      
      // Update tab immediately for instant visual feedback
      if (tab && (tab === 'company' || tab === 'branches' || tab === 'compliances')) {
        this.activeTab = tab;
      }
      
      if (clientId) {
        const id = clientId;
        // If we already have this client loaded, just switch tabs
        if (this.selectedClient?.id === id) {
          this.handleTabChange(tab as 'company' | 'branches' | 'compliances');
        } else {
          // Load new client
          this.loadClientById(id, tab as 'company' | 'branches' | 'compliances');
        }
      } else {
        // No client ID in route - show list
        this.selectedClient = null;
        this.branches = [];
        this.activeTab = 'company';
      }
    });
  }

  private loadServiceModules(): void {
    this.entitlementsApi.listModules().pipe(
      timeout(10000),
      catchError(() => of([])),
      takeUntil(this.destroy$),
    ).subscribe((modules) => {
      this.serviceModuleOptions = modules || [];
      this.cdr.detectChanges();
    });
  }

  isServiceSelected(code: string): boolean {
    return this.clientForm.serviceModules.includes(code);
  }

  toggleService(code: string, checked: boolean): void {
    const current = new Set(this.clientForm.serviceModules);
    if (checked) current.add(code);
    else current.delete(code);
    this.clientForm.serviceModules = Array.from(current);
  }

  /**
   * Attendance system is chosen once per client from a friendly menu; each
   * choice maps to the underlying attendance modules that gate what client and
   * branch users see. Selecting one replaces any other attendance module,
   * leaving non-attendance services (compliance, payroll, …) untouched.
   */
  readonly attendanceSystems: Array<{
    key: string;
    label: string;
    modules: string[];
  }> = [
    { key: 'PIN_FACE', label: 'PIN + Face', modules: ['CONTRACTOR_FACE_ATTENDANCE'] },
    {
      key: 'FACE_BIOMETRIC',
      label: 'Face + Biometric',
      modules: ['CONTRACTOR_FACE_ATTENDANCE', 'EMPLOYEE_ATTENDANCE'],
    },
    { key: 'ESSL', label: 'eSSL', modules: ['EMPLOYEE_ATTENDANCE'] },
  ];

  /** All attendance-gating modules the selector manages (mutually exclusive). */
  private readonly attendanceModuleCodes = [
    'CONTRACTOR_FACE_ATTENDANCE',
    'EMPLOYEE_ATTENDANCE',
  ];

  get selectedAttendanceSystem(): string {
    const set = new Set(this.clientForm.serviceModules);
    const match = this.attendanceSystems.find(
      (s) =>
        s.modules.every((m) => set.has(m)) &&
        this.attendanceModuleCodes
          .filter((m) => !s.modules.includes(m))
          .every((m) => !set.has(m)),
    );
    return match?.key ?? '';
  }

  setAttendanceSystem(sys: { key: string; modules: string[] }): void {
    const current = new Set(this.clientForm.serviceModules);
    // Clear every attendance module, then apply this system's set.
    this.attendanceModuleCodes.forEach((m) => current.delete(m));
    sys.modules.forEach((m) => current.add(m));
    this.clientForm.serviceModules = Array.from(current);
  }

  clearAttendanceSystem(): void {
    const current = new Set(this.clientForm.serviceModules);
    this.attendanceModuleCodes.forEach((code) => current.delete(code));
    this.clientForm.serviceModules = Array.from(current);
  }

  serviceSummary(client: Client): string {
    const count = client.enabledModules?.length || 0;
    if (client.servicePackage === 'FULL_SERVICE') return 'Full Service';
    if (!count) return 'No active services';
    return `${count} active service${count === 1 ? '' : 's'}`;
  }

  serviceStatusLabel(client: Client): string {
    switch (client.servicePackageStatus) {
      case 'PENDING_CCO':
        return 'Pending CCO';
      case 'REJECTED':
        return 'Rejected';
      case 'CHANGES_REQUESTED':
        return 'Changes requested';
      case 'UNAPPROVED':
        return 'Not approved';
      default:
        return 'Approved';
    }
  }

  serviceStatusVariant(
    client: Client,
  ): 'success' | 'warning' | 'error' | 'gray' {
    switch (client.servicePackageStatus) {
      case 'PENDING_CCO':
      case 'CHANGES_REQUESTED':
        return 'warning';
      case 'REJECTED':
        return 'error';
      case 'UNAPPROVED':
        return 'gray';
      default:
        return 'success';
    }
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleTabChange(tab: 'company' | 'branches' | 'compliances') {
    if (!this.selectedClient) return;
    
    this.activeTab = tab || 'branches';
    
    // Load data for the specific tab if needed
    if (tab === 'branches' && this.branches.length === 0) {
      this.loadBranches();
    } else if (tab === 'compliances' && !this.branchForCompliance) {
      if (this.branches.length > 0) {
        this.selectBranchForCompliance(this.branches[0]);
      } else {
        this.loadBranches();
      }
    }
  }

  // CLIENT OPERATIONS
  loadClients() {
    this.error = '';
    this.loading = true;
    const safetyTimer = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.cdr.detectChanges();
      }
    }, 8000);
    this.service.getClients().pipe(
      timeout(20000),
      catchError(() => {
        this.error = 'Failed to load clients';
        return of([]);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        clearTimeout(safetyTimer);
        this.loading = false;
        this.cdr.detectChanges();
      }),
    ).subscribe((res) => {
      const all = res || [];
      this.clients = all.filter(c => (c.status || 'ACTIVE') === 'ACTIVE');
      this.cdr.detectChanges();
    });
  }

  createClient() {
    const name = this.clientForm.clientName.trim();
    if (!name) {
      this.error = 'Client name is required';
      return;
    }

    // Validate master user fields
    const mu = this.clientForm;
    if (!mu.masterUserName.trim()) {
      this.error = 'Master user name is required';
      return;
    }
    if (!mu.masterUserEmail.trim()) {
      this.error = 'Master user email is required';
      return;
    }
    if (!mu.masterUserPassword || mu.masterUserPassword.length < 6) {
      this.error = 'Master user password must be at least 6 characters';
      return;
    }
    if (this.masterUserEmailError) {
      this.error = this.masterUserEmailError;
      return;
    }
    if (this.masterUserMobileError) {
      this.error = this.masterUserMobileError;
      return;
    }
    if (!this.clientForm.serviceModules.length) {
      this.error = 'Select at least one client service';
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.createdMasterUser = null;

    const payload: any = {
      clientName: name,
      masterUserName: mu.masterUserName.trim(),
      masterUserEmail: mu.masterUserEmail.trim(),
      masterUserPassword: mu.masterUserPassword,
      servicePackageCode: mu.servicePackageCode,
      serviceModules: [...mu.serviceModules],
    };
    if (mu.servicePackageNote.trim()) {
      payload.servicePackageNote = mu.servicePackageNote.trim();
    }
    if (mu.masterUserMobile.trim()) {
      payload.masterUserMobile = mu.masterUserMobile.trim();
    }

    this.service.createClient(payload).pipe(
      timeout(12000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to create client';
        throw err;
      }),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (res) => {
        this.success = res.serviceRequestId
          ? 'Client registered. Service access sent to CCO for approval.'
          : 'Client registered successfully';
        // Show master user credentials banner
        if (res.masterUserEmail) {
          this.createdMasterUser = {
            email: res.masterUserEmail,
            password: mu.masterUserPassword,
          };
        }
        this.clientForm = {
          clientName: '',
          masterUserName: '',
          masterUserEmail: '',
          masterUserMobile: '',
          masterUserPassword: '',
          servicePackageCode: 'CUSTOM_SERVICES',
          serviceModules: ['EMPLOYEE_COMPLIANCE'],
          servicePackageNote: '',
        };
        // Upload logo if selected during registration
        if (res.id && this.regLogoFile) {
          this.service.uploadLogo(res.id, this.regLogoFile).pipe(
            timeout(15000),
            catchError(() => of(null)),
            takeUntil(this.destroy$),
          ).subscribe();
          this.regLogoFile = null;
          this.regLogoPreviewUrl = null;
        }
        this.loadClients();
        if (res.id) {
          this.openClient(res.id);
        }
      },
    });
  }

  openClient(clientId: string) {
    this.router.navigate(['/admin/clients', clientId, 'branches']);
  }

  async deleteClient(client: Client) {
    if (!client?.id) return;

    const label = client.clientName || 'this client';
    if (!(await this.dialog.confirm('Deactivate Client', `Deactivate client: ${label}?`, { variant: 'danger', confirmText: 'Deactivate' }))) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.deleteClient(client.id).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to delete client';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
      }),
    ).subscribe({
      next: (res) => {
        if (res) {
          if (res.status === 'PENDING') {
            this.success = 'Deletion request sent to CEO for approval';
          } else {
            this.success = 'Client deleted';
          }
        }
        this.loadClients();
      },
    });
  }

  private loadClientById(clientId: string, tab?: 'company' | 'branches' | 'compliances') {
    // Update UI immediately for instant feedback
    this.activeTab = tab || 'branches';
    
    this.loading = true;
    this.service.getClient(clientId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = 'Failed to load client details';
        throw err;
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (client) => {
        this.selectedClient = client;
        this.populateEditForm(client);
        this.activeTab = tab || 'branches';
        this.loadBranches();
        this.loadClientUsers(client.id);
        this.loadSelectedClientServices(client.id);
      },
      error: () => {
      },
    });
  }

  private loadSelectedClientServices(clientId: string): void {
    this.entitlementsApi.getClientStatus(clientId).pipe(
      timeout(10000),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (status) => {
        if (!this.selectedClient || this.selectedClient.id !== clientId) return;
        this.selectedClient = {
          ...this.selectedClient,
          servicePackage: status.packageCode,
          enabledModules: status.enabledModules,
        };
        if (this.hasFaceAttendanceService) this.loadAzureBackfillStatus();
        this.cdr.detectChanges();
      },
      error: () => {
        this.azureBackfillStatus = null;
      },
    });
  }

  loadAzureBackfillStatus(): void {
    if (!this.selectedClient || !this.hasFaceAttendanceService) return;
    this.loadingAzureBackfill = true;
    this.azureBackfillError = '';
    this.service.getAzureFaceBackfillStatus(this.selectedClient.id).pipe(
      timeout(10000),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loadingAzureBackfill = false;
        this.cdr.detectChanges();
      }),
    ).subscribe({
      next: (status) => {
        this.azureBackfillStatus = status;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.azureBackfillError = err.error?.message || 'Unable to load Azure Face status';
      },
    });
  }

  async runAzureBackfillCanary(): Promise<void> {
    if (!this.selectedClient || this.syncingAzureBackfill) return;
    const confirmed = await this.dialog.confirm(
      'Run Azure Face Test',
      `Register one stored face for ${this.selectedClient.clientName} and train its Azure face list?`,
      { confirmText: 'Run Test' },
    );
    if (confirmed) this.startAzureBackfill(1, false);
  }

  async runAzureBackfillAll(): Promise<void> {
    if (!this.selectedClient || this.syncingAzureBackfill) return;
    const pending = this.azureBackfillStatus?.pending ?? 0;
    const confirmed = await this.dialog.confirm(
      'Sync Azure Faces',
      `Register up to ${pending} pending face${pending === 1 ? '' : 's'} for ${this.selectedClient.clientName}? The operation runs in paced batches.`,
      { confirmText: 'Start Sync' },
    );
    if (confirmed) this.startAzureBackfill(25, true);
  }

  private startAzureBackfill(limit: number, continueUntilDone: boolean): void {
    this.syncingAzureBackfill = true;
    this.azureBackfillError = '';
    this.azureBackfillResult = {
      scanned: 0,
      registered: 0,
      skippedNoPhoto: 0,
      failed: 0,
      trained: null,
      nextCursor: null,
      done: false,
      errors: [],
    };
    this.runAzureBackfillBatch(undefined, limit, continueUntilDone, 0);
  }

  private runAzureBackfillBatch(
    cursor: string | undefined,
    limit: number,
    continueUntilDone: boolean,
    batchCount: number,
  ): void {
    const clientId = this.selectedClient?.id;
    if (!clientId) {
      this.syncingAzureBackfill = false;
      return;
    }
    if (batchCount >= 100) {
      this.syncingAzureBackfill = false;
      this.azureBackfillError = 'Sync paused after 100 batches. Refresh status before continuing.';
      return;
    }

    this.service.backfillAzureFaces(clientId, { cursor, limit }).pipe(
      timeout(30000),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (result) => {
        const previous = this.azureBackfillResult!;
        this.azureBackfillResult = {
          ...result,
          scanned: previous.scanned + result.scanned,
          registered: previous.registered + result.registered,
          skippedNoPhoto: previous.skippedNoPhoto + result.skippedNoPhoto,
          failed: previous.failed + result.failed,
          errors: [...previous.errors, ...result.errors].slice(0, 5),
        };
        this.cdr.detectChanges();

        if (continueUntilDone && !result.done && result.nextCursor) {
          this.runAzureBackfillBatch(result.nextCursor, limit, true, batchCount + 1);
          return;
        }
        this.syncingAzureBackfill = false;
        this.loadAzureBackfillStatus();
      },
      error: (err) => {
        this.syncingAzureBackfill = false;
        this.azureBackfillError = err.error?.message || 'Azure Face sync failed';
        this.loadAzureBackfillStatus();
      },
    });
  }

  // CLIENT USER OPERATIONS
  loadClientUsers(clientId: string) {
    this.service.getClientUsers(clientId).pipe(
      timeout(8000),
      catchError(() => {
        this.error = 'Failed to load client users';
        return of([] as ClientUserLink[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (links) => {
        this.clientUsers = links || [];
      },
    });
  }

  loadAvailableClientUsers() {
    this.service.getClientRoleUsers().pipe(
      timeout(8000),
      catchError(() => {
        return of([] as ClientUserOption[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (users) => {
        this.availableClientUsers = users || [];
        this.rebuildClientUserSelectOptions();
      },
    });
  }

  linkClientUser() {
    if (!this.selectedClient || !this.selectedClientUserId) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.addClientUser(this.selectedClient.id, this.selectedClientUserId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to link client user';
        throw err;
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: () => {
        this.success = 'Client user linked successfully';
        this.selectedClientUserId = null;
        this.loadClientUsers(this.selectedClient!.id);
      },
    });
  }

  async unlinkClientUser(link: ClientUserLink) {
    if (!this.selectedClient) return;
    if (!(await this.dialog.confirm('Unlink User', `Unlink client user ${link.name} (${link.email})?`, { variant: 'danger', confirmText: 'Unlink' }))) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.removeClientUser(this.selectedClient.id, link.userId).pipe(
      timeout(8000),
      catchError(() => {
        this.error = 'Failed to unlink client user';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (res) => {
        if (res) {
          this.success = 'Client user unlinked';
        }
        this.loadClientUsers(this.selectedClient!.id);
      },
    });
  }

  // BRANCH OPERATIONS
  loadBranches() {
    if (!this.selectedClient) return;
    
    this.loading = true;
    this.service.getBranches(this.selectedClient.id).pipe(
      timeout(8000),
      catchError((err) => {
        if (err?.status === 401) {
          this.error = 'Unauthorized: Please log in.';
        } else if (err?.status === 403) {
          this.error = 'Forbidden: You do not have access.';
        } else if (err?.error?.message) {
          this.error = err.error.message;
        } else {
          this.error = 'Failed to load branches (unexpected error).';
        }
        return of([]);
      }),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (res) => {
        this.deferUi(() => {
          this.branches = res || [];
          // Auto-select first branch when on compliances tab with no branch selected
          if (this.activeTab === 'compliances' && !this.branchForCompliance && this.branches.length > 0) {
            this.selectBranchForCompliance(this.branches[0]);
          }
        });
      },
    });
  }

  createOrUpdateBranch() {
    if (!this.selectedClient) return;
    
    if (!this.branchForm.branchName.trim()) {
      this.error = 'Branch name is required';
      return;
    }

    // Branch desk user is mandatory
    if (!this.editingBranchId) {
      if (!this.branchForm.branchUserName?.trim()) {
        this.branchSaveError = 'Branch user name is required. Every branch must have a desk user.';
        return;
      }
      if (!this.branchForm.branchUserEmail?.trim()) {
        this.branchSaveError = 'Branch user email is required. Every branch must have a desk user.';
        return;
      }
      if (!this.branchForm.branchUserMobile?.trim()) {
        this.branchSaveError = 'Branch user mobile number is required. Every branch must have a desk user.';
        return;
      }
      if (this.branchUserEmailError) {
        this.branchSaveError = this.branchUserEmailError;
        return;
      }
      if (this.branchUserMobileError) {
        this.branchSaveError = this.branchUserMobileError;
        return;
      }
    }

    this.isSavingBranch = true;
    this.branchSaveMessage = '';
    this.branchSaveError = '';
    this.createdBranchUser = null;

    const emp = Number(this.branchForm.employeeCount ?? 0) || 0;
    const cont = Number(this.branchForm.contractorCount ?? 0) || 0;
    this.branchForm.headcount = Number(this.branchForm.headcount ?? emp + cont) || (emp + cont);

    const updatePayload = {
      branchName: this.branchForm.branchName,
      branchType: this.branchForm.branchType,
      stateCode: this.branchForm.stateCode,
      establishmentType: this.branchForm.establishmentType,
      city: this.branchForm.city,
      pincode: this.branchForm.pincode,
      headcount: this.branchForm.headcount,
      address: this.branchForm.address,
      employeeCount: this.branchForm.employeeCount,
      contractorCount: this.branchForm.contractorCount,
      status: this.branchForm.status,
    };

    const operation = this.editingBranchId
      ? this.service.updateBranch(this.editingBranchId, updatePayload)
      : this.service.createBranch(this.selectedClient.id, this.branchForm);

    operation.pipe(
      timeout(8000),
      catchError((err) => {
        this.branchSaveError = err.error?.message || `Failed to ${this.editingBranchId ? 'update' : 'add'} branch`;
        throw err;
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSavingBranch = false;
      })
    ).subscribe({
      next: (res: any) => {
        const updatedId = this.editingBranchId;
        this.branchSaveMessage = `Branch ${updatedId ? 'updated' : 'added'} successfully`;
        this.branchUserErrorMessage = res?.branchUserError || '';
        if (!updatedId && res?.branchUser) {
          this.createdBranchUser = {
            email: res.branchUser.email,
            password: res.branchUser.password ?? null,
            linkedExisting: !!res.branchUser.linkedExisting,
          };
          if (res.branchUser.linkedExisting) {
            this.branchSaveMessage = 'Branch added and the existing branch login was linked to it.';
          }
        }
        this.resetBranchForm();
        // Defer branch reload to avoid ExpressionChanged if form fields clear mid-check
        this.deferUi(() => this.loadBranches());
        if (updatedId && this.branchForCompliance?.id === updatedId) {
          this.loadBranchCompliances(updatedId);
        }
      },
    });
  }

  editBranch(branch: Branch) {
    const copy = { ...branch } as Branch;
    this.deferUi(() => {
      this.editingBranchId = branch.id || null;
      this.branchForm = copy;
    });

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async deleteBranch(branchId: string): Promise<void> {
    const ok = await this.dialog.confirm(
      'Delete Branch',
      'Delete this branch?',
      { variant: 'danger', confirmText: 'Delete' },
    );
    if (!ok) return;

    this.service.deleteBranch(branchId).pipe(
      timeout(8000),
      catchError(() => {
        this.error = 'Failed to delete branch';
        return of(null);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        this.deferUi(() => {
          this.success = 'Branch deleted';
          this.error = '';
        });
        this.loadBranches();
      },
    });
  }

  resetBranchForm() {
    const defaults: Branch = {
      branchName: '',
      branchType: 'HO',
      stateCode: null,
      address: '',
      headcount: 0,
      employeeCount: 0,
      contractorCount: 0,
      status: 'ACTIVE',
      branchUserName: '',
      branchUserEmail: '',
      branchUserMobile: '',
      branchUserPassword: ''
    } as any;

    this.deferUi(() => {
      this.editingBranchId = null;
      this.branchForm = { ...defaults };
      this.branchUserErrorMessage = '';
    });
  }

  // COMPLIANCE OPERATIONS
  loadCompliances() {
    this.service.getCompliances().pipe(
      timeout(8000),
      catchError(() => {
        return of([]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res) => {
        // Kept for legacy use; actual branch applicability is loaded per-branch.
        this.compliances = (res || []) as any;
      },
    });
  }

  selectBranchForCompliance(branch: Branch) {
    // Update UI immediately for instant feedback
    this.branchForCompliance = branch;
    this.compliances = [];
    this.selectedComplianceIds = new Set<string>();
    this.selectedCount = 0;
    
    // Navigate to compliances tab only if not already there
    if (this.selectedClient && this.activeTab !== 'compliances') {
      this.router.navigate(['/admin/clients', this.selectedClient.id, 'compliances']);
    }
    
    // Then load the compliance data
    if (branch.id) {
      this.loadBranchCompliances(branch.id);
    }
  }

  recomputeApplicability() {
    if (!this.branchForCompliance?.id) return;
    this.isRecomputing = true;
    const branchId = this.branchForCompliance.id;
    this.service.recomputeBranchCompliances(branchId).pipe(
      timeout(8000),
      catchError(() => {
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isRecomputing = false;
      }),
    ).subscribe({
      next: () => {
        this.loadBranchCompliances(branchId);
      },
    });
  }

  private loadBranchCompliances(branchId: string) {
    this.service.getBranchCompliances(branchId).pipe(
      timeout(8000),
      catchError(() => {
        return of([]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (items: any) => {
        // Support either array of applicability objects or { complianceIds }
        if (Array.isArray(items)) {
          this.compliances = items as BranchComplianceApplicability[];
          const ids = (items || []).filter((c: any) => c.selected).map((c: any) => c.complianceId);
          this.selectedComplianceIds = new Set<string>(ids);
        } else {
          const ids = (items?.complianceIds as string[]) || [];
          this.selectedComplianceIds = new Set<string>(ids);
          this.compliances = [];
        }
        this.recalcSelectedCount();
        this.cdr.detectChanges();
      },
    });
  }

  // CONTRACTOR OPERATIONS (per branch)

  selectBranchForContractors(branch: Branch) {
    this.branchForContractors = branch;
    this.branchContractors = [];
    this.selectedContractorUserId = null;

    // scroll to contractors section
    setTimeout(() => {
      document.getElementById('branchContractorsCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

    if (branch.id && this.selectedClient?.id) {
      this.loadBranchContractors(branch.id);
      this.loadAvailableContractors(this.selectedClient.id);
    }
  }

  loadBranchContractors(branchId: string) {
    this.service.getBranchContractors(branchId).pipe(
      timeout(8000),
      catchError(() => {
        this.error = 'Failed to load branch contractors';
        this.cdr.detectChanges();
        return of([] as BranchContractorLink[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (links) => {
        this.branchContractors = links || [];
        this.cdr.detectChanges();
      },
    });
  }

  loadAvailableContractors(clientId: string) {
    this.service.getContractorUsers(clientId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err?.error?.message || 'Failed to load contractor users';
        this.cdr.detectChanges();
        return of([] as ContractorOption[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (users) => {
        this.availableContractors = users || [];
        this.rebuildContractorSelectOptions();
        this.cdr.detectChanges();
      },
    });
  }

  linkContractorToBranch() {
    if (!this.branchForContractors?.id || !this.selectedContractorUserId) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.addBranchContractor(this.branchForContractors.id, this.selectedContractorUserId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to link contractor';
        throw err;
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: () => {
        this.success = 'Contractor linked to branch';
        this.selectedContractorUserId = null;
        const currentBranchId = this.branchForContractors?.id;
        if (currentBranchId) {
          this.loadBranchContractors(currentBranchId);
        }
      },
    });
  }

  async unlinkContractorFromBranch(link: BranchContractorLink): Promise<void> {
    if (!this.branchForContractors?.id) return;
    const ok = await this.dialog.confirm(
      'Unlink Contractor',
      `Unlink contractor ${link.name} (${link.email}) from this branch?`,
      { variant: 'danger', confirmText: 'Unlink' },
    );
    if (!ok) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.removeBranchContractor(this.branchForContractors.id, link.userId).pipe(
      timeout(8000),
      catchError(() => {
        this.error = 'Failed to unlink contractor';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (res) => {
        if (res) {
          this.success = 'Contractor unlinked from branch';
        }
        const currentBranchId = this.branchForContractors?.id;
        if (currentBranchId) {
          this.loadBranchContractors(currentBranchId);
        }
      },
    });
  }

  // BRANCH USERS (login accounts)

  selectBranchForUsers(branch: Branch) {
    this.branchForUsers = branch;
    this.branchUsers = [];
    this.availableBranchUsers = [];
    this.selectedBranchUserId = null;
    this.branchUserLinkError = '';
    this.branchUserResetResult = null;

    setTimeout(() => {
      document.getElementById('branchUsersCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

    if (branch.id) {
      this.loadBranchUsers(branch.id);
      this.loadAvailableBranchUsers();
    }
  }

  get hasFaceAttendanceService(): boolean {
    return this.selectedClient?.servicePackage === 'FULL_SERVICE' ||
      this.selectedClient?.enabledModules?.includes('CONTRACTOR_FACE_ATTENDANCE') === true;
  }

  get branchUserSelectOptions(): SelectOption[] {
    const linked = new Set(this.branchUsers.map((user) => user.userId));
    return this.availableBranchUsers
      .filter((user) => !linked.has(user.id))
      .map((user) => ({ value: user.id, label: `${user.name} (${user.email})` }));
  }

  private loadAvailableBranchUsers() {
    const branchId = this.branchForUsers?.id;
    if (!branchId) return;
    this.service.getAvailableBranchUsers(branchId).pipe(
      timeout(8000),
      catchError(() => of([] as ClientUserOption[])),
      takeUntil(this.destroy$),
    ).subscribe((users) => {
      this.availableBranchUsers = users || [];
      this.cdr.detectChanges();
    });
  }

  linkBranchUser() {
    const branchId = this.branchForUsers?.id;
    if (!branchId || !this.selectedBranchUserId) return;
    this.linkingBranchUser = true;
    this.branchUserLinkError = '';
    this.service.addBranchUser(branchId, this.selectedBranchUserId).pipe(
      timeout(8000),
      takeUntil(this.destroy$),
      finalize(() => {
        this.linkingBranchUser = false;
        this.cdr.detectChanges();
      }),
    ).subscribe({
      next: () => {
        this.selectedBranchUserId = null;
        this.loadBranchUsers(branchId);
      },
      error: (err) => {
        this.branchUserLinkError = err?.error?.message || 'Failed to link branch user';
      },
    });
  }

  loadBranchUsers(branchId: string) {
    this.service.getBranchUsers(branchId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err?.error?.message || 'Failed to load branch users';
        this.cdr.detectChanges();
        return of([] as BranchUserLink[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (users) => {
        this.branchUsers = users || [];
        this.cdr.detectChanges();
      },
    });
  }

  async resetBranchUserPassword(user: BranchUserLink): Promise<void> {
    const ok = await this.dialog.confirm(
      'Reset Password',
      `Reset password for ${user.name} (${user.email})? A new password will be generated.`,
      { confirmText: 'Reset' },
    );
    if (!ok) return;

    this.error = '';
    this.success = '';
    this.branchUserResetResult = null;
    this.resettingBranchUserId = user.userId;

    this.service.resetUserPassword(user.userId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err?.error?.message || 'Failed to reset password';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.resettingBranchUserId = null;
        this.cdr.detectChanges();
      }),
    ).subscribe((res) => {
      if (res) {
        this.branchUserResetResult = { email: user.email, newPassword: res.newPassword };
        this.success = 'Password reset successfully';
        this.cdr.detectChanges();
      }
    });
  }

  saveBranchCompliances() {
    if (!this.branchForCompliance?.id || !this.selectedClient) return;

    this.isSavingCompliances = true;
    this.complianceSaveMessage = '';
    this.complianceSaveError = '';

    const branchId = this.branchForCompliance.id;
    const clientId = this.selectedClient.id;
    const complianceIds = Array.from(this.selectedComplianceIds);

    this.service.saveBranchCompliances(branchId, clientId, complianceIds).pipe(
      timeout(8000),
      catchError((err) => {
        this.complianceSaveError = err?.error?.message || 'Failed to save compliances';
        throw err;
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSavingCompliances = false;
      })
    ).subscribe({
      next: (res: any) => {
        const ids = (res?.complianceIds as string[]) || [];
        this.selectedComplianceIds = new Set<string>(ids);
        this.recalcSelectedCount();
        this.complianceSaveMessage = `Saved ${this.selectedCount} compliance(s) successfully.`;
        this.loadBranchCompliances(branchId);
      },
    });
  }

  toggleCompliance(complianceId: string, checked: boolean) {
    const next = new Set<string>(this.selectedComplianceIds);
    if (checked) next.add(complianceId);
    else next.delete(complianceId);
    this.selectedComplianceIds = next;
    this.recalcSelectedCount();
  }

  private recalcSelectedCount() {
    this.selectedCount = this.selectedComplianceIds.size;
  }

  goBack() {
    this.selectedClient = null;
    this.branches = [];
    this.clientUsers = [];
    this.availableClientUsers = [];
    this.selectedClientUserId = null;
    this.branchForContractors = null;
    this.branchContractors = [];
    this.availableContractors = [];
    this.selectedContractorUserId = null;
    this.branchForUsers = null;
    this.branchUsers = [];
    this.availableBranchUsers = [];
    this.selectedBranchUserId = null;
    this.branchUserResetResult = null;
    this.editingMasterUser = null;
    this.masterUserResetResult = null;
    this.azureBackfillStatus = null;
    this.azureBackfillResult = null;
    this.azureBackfillError = '';
    this.activeTab = 'company';
    this.router.navigate(['/admin/clients']);
  }

  setTab(tab: 'company' | 'branches' | 'compliances') {
    if (this.selectedClient) {
      // Just navigate - the route subscription will update activeTab
      this.router.navigate(['/admin/clients', this.selectedClient.id, tab]);
    }
  }

  trackById(_index: number, item: any): string | number {
    return item.id || item.complianceId || item;
  }

  private deferUi(fn: () => void) {
    setTimeout(() => {
      fn();
      this.cdr.detectChanges();
    }, 0);
  }

  // ── Client Edit + Readiness ────────────────────────────────
  private populateEditForm(client: Client) {
    this.editClientForm = {
      clientName: client.clientName || '',
      companyCode: client.companyCode || '',
      industry: client.industry || '',
      state: client.state || '',
      registeredAddress: client.registeredAddress || '',
      primaryContactName: client.primaryContactName || '',
      primaryContactEmail: client.primaryContactEmail || '',
      primaryContactMobile: client.primaryContactMobile || '',
    };
    this.readinessResult = null;
  }

  saveClientDetails() {
    if (!this.selectedClient) return;
    this.savingClient = true;
    this.error = '';
    this.success = '';

    this.service.updateClient(this.selectedClient.id, this.editClientForm).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to update client';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.savingClient = false;
        this.cdr.detectChanges();
      }),
    ).subscribe((res) => {
      if (res) {
        this.success = 'Client details updated';
        this.selectedClient = { ...this.selectedClient!, ...res };
      }
    });
  }

  loadReadinessCheck() {
    if (!this.selectedClient) return;
    this.loadingReadiness = true;
    this.cdr.detectChanges();

    this.service.getReadinessCheck(this.selectedClient.id).pipe(
      timeout(8000),
      catchError(() => {
        this.error = 'Failed to load readiness check';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loadingReadiness = false;
        this.cdr.detectChanges();
      }),
    ).subscribe((res) => {
      this.readinessResult = res;
    });
  }

  toggleCrmOnBehalf() {
    if (!this.selectedClient) return;
    const newValue = !this.selectedClient.crmOnBehalfEnabled;
    this.service.toggleCrmOnBehalf(this.selectedClient.id, newValue).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        this.selectedClient!.crmOnBehalfEnabled = newValue;
        this.success = `CRM on-behalf ${newValue ? 'enabled' : 'disabled'} successfully`;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Failed to toggle CRM on-behalf';
        this.cdr.detectChanges();
      },
    });
  }

  // ── Master User Edit ─────────────────────────────────────
  startEditMasterUser(u: { userId: string; name: string; email: string; mobile: string | null }) {
    this.editingMasterUser = {
      userId: u.userId,
      name: u.name,
      email: u.email,
      mobile: u.mobile || '',
    };
    this.masterUserResetResult = null;
  }

  cancelEditMasterUser() {
    this.editingMasterUser = null;
  }

  saveMasterUser() {
    if (!this.editingMasterUser || !this.selectedClient) return;

    const mu = this.editingMasterUser;
    if (!mu.name.trim()) {
      this.error = 'Name is required';
      return;
    }
    if (!mu.email.trim()) {
      this.error = 'Email is required';
      return;
    }
    if (this.editMasterEmailError) {
      this.error = this.editMasterEmailError;
      return;
    }
    if (this.editMasterMobileError) {
      this.error = this.editMasterMobileError;
      return;
    }

    this.savingMasterUser = true;
    this.error = '';
    this.success = '';

    this.service.updateUser(mu.userId, {
      name: mu.name.trim(),
      email: mu.email.trim(),
      mobile: mu.mobile?.trim() || undefined,
    }).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to update master user';
        return of(null);
      }),
      takeUntil(this.destroy$),
      finalize(() => {
        this.savingMasterUser = false;
        this.cdr.detectChanges();
      }),
    ).subscribe((res) => {
      if (res) {
        this.success = 'Master user updated successfully';
        this.editingMasterUser = null;
        this.loadClientUsers(this.selectedClient!.id);
      }
    });
  }

  async resetMasterUserPassword(userId: string): Promise<void> {
    const ok = await this.dialog.confirm(
      'Reset Password',
      'Reset this user\'s password? A new password will be generated.',
      { confirmText: 'Reset' },
    );
    if (!ok) return;

    this.error = '';
    this.success = '';
    this.masterUserResetResult = null;

    this.service.resetUserPassword(userId).pipe(
      timeout(8000),
      catchError((err) => {
        this.error = err.error?.message || 'Failed to reset password';
        return of(null);
      }),
      takeUntil(this.destroy$),
    ).subscribe((res) => {
      if (res) {
        this.masterUserResetResult = { newPassword: res.newPassword };
        this.success = 'Password reset successfully';
        this.cdr.detectChanges();
      }
    });
  }

  // ── Logo upload methods ──────────────────────────────────
  onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.logoFile = file;
    this.logoUploadMessage = '';
    this.logoUploadError = '';
    // Generate local preview
    const reader = new FileReader();
    reader.onload = (e) => { this.logoPreviewUrl = e.target?.result as string; this.cdr.detectChanges(); };
    reader.readAsDataURL(file);
  }

  onRegLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.regLogoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { this.regLogoPreviewUrl = e.target?.result as string; this.cdr.detectChanges(); };
    reader.readAsDataURL(file);
  }

  removeRegLogo(): void {
    this.regLogoFile = null;
    this.regLogoPreviewUrl = null;
  }

  uploadLogo(): void {
    if (!this.selectedClient) return;
    if (!this.logoFile) { this.logoUploadError = 'Select a file first'; return; }
    this.uploadingLogo = true;
    this.logoUploadMessage = '';
    this.logoUploadError = '';
    this.service.uploadLogo(this.selectedClient.id, this.logoFile).pipe(
      timeout(15000),
      catchError((err) => { this.logoUploadError = err.error?.message || 'Upload failed'; return of(null); }),
      finalize(() => { this.uploadingLogo = false; this.cdr.detectChanges(); }),
      takeUntil(this.destroy$),
    ).subscribe((res) => {
      if (res) {
        this.logoUploadMessage = 'Logo uploaded successfully';
        this.selectedClient!.logoUrl = res.logoUrl;
        this.logoFile = null;
        this.logoPreviewUrl = null;
      }
    });
  }

  getAuthenticatedLogoUrl(url: string): string {
    return this.auth.authenticateUrl(url);
  }
}
