import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink, NavigationEnd } from '@angular/router';
import { finalize, timeout, catchError } from 'rxjs/operators';
import { of, Subscription, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AdminClientsService, Client, Branch, BranchComplianceApplicability, ClientUserLink, ClientUserOption, BranchContractorLink, ContractorOption } from './admin-clients.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../core/auth.service';
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
    CommonModule, FormsModule, RouterLink,
    PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent,
    DataTableComponent, TableCellDirective, FormInputComponent,
    FormSelectComponent, EmptyStateComponent,
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

  // Client section
  clients: Client[] = [];
  selectedClient: Client | null = null;
  clientForm = {
    clientName: '',
    masterUserName: '',
    masterUserEmail: '',
    masterUserMobile: '',
    masterUserPassword: '',
  };
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

  createdBranchUser: { email: string; password: string } | null = null;

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

  // Master user edit state
  editingMasterUser: { userId: string; name: string; email: string; mobile: string } | null = null;
  savingMasterUser = false;
  masterUserResetResult: { newPassword: string } | null = null;

  // Logo upload state
  logoUploadMode: 'file' | 'svg' = 'file';
  logoFile: File | null = null;
  logoPreviewUrl: string | null = null;
  svgCodeInput = '';
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
    { key: 'employeeCount', header: 'Employees' },
    { key: 'contractorCount', header: 'Contractors' },
    { key: 'actions', header: 'Actions', align: 'right' },
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

  ngOnInit(): void {
    this.loadClients();
    this.loadCompliances();

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
          this.handleTabChange(tab as any);
        } else {
          // Load new client
          this.loadClientById(id, tab as any);
        }
      } else {
        // No client ID in route - show list
        this.selectedClient = null;
        this.branches = [];
        this.activeTab = 'company';
      }
    });
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
      catchError((err) => {
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

    this.loading = true;
    this.error = '';
    this.success = '';
    this.createdMasterUser = null;

    const payload: any = {
      clientName: name,
      masterUserName: mu.masterUserName.trim(),
      masterUserEmail: mu.masterUserEmail.trim(),
      masterUserPassword: mu.masterUserPassword,
    };
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
        this.success = 'Client registered successfully';
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

    const label = client.clientName || `Client #${client.id}`;
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
      },
      error: () => {
      },
    });
  }

  // CLIENT USER OPERATIONS
  loadClientUsers(clientId: string) {
    this.service.getClientUsers(clientId).pipe(
      timeout(8000),
      catchError((err) => {
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
      catchError((err) => {
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
      catchError((err) => {
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
    }

    this.isSavingBranch = true;
    this.branchSaveMessage = '';
    this.branchSaveError = '';
    this.createdBranchUser = null;

    const emp = Number(this.branchForm.employeeCount ?? 0) || 0;
    const cont = Number(this.branchForm.contractorCount ?? 0) || 0;
    this.branchForm.headcount = Number(this.branchForm.headcount ?? emp + cont) || (emp + cont);

    const operation = this.editingBranchId
      ? this.service.updateBranch(this.editingBranchId, this.branchForm)
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
            password: res.branchUser.password,
          };
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

  deleteBranch(branchId: string) {
    if (!confirm('Delete this branch?')) return;

    this.service.deleteBranch(branchId).pipe(
      timeout(8000),
      catchError((err) => {
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
      catchError((err) => {
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
      catchError((err) => {
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
      catchError((err) => {
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
      catchError((err) => {
        this.error = 'Failed to load branch contractors';
        return of([] as BranchContractorLink[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (links) => {
        this.branchContractors = links || [];
      },
    });
  }

  loadAvailableContractors(clientId: string) {
    this.service.getContractorUsers(clientId).pipe(
      timeout(8000),
      catchError((err) => {
        return of([] as ContractorOption[]);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (users) => {
        this.availableContractors = users || [];
        this.rebuildContractorSelectOptions();
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

  unlinkContractorFromBranch(link: BranchContractorLink) {
    if (!this.branchForContractors?.id) return;
    if (!confirm(`Unlink contractor ${link.name} (${link.email}) from this branch?`)) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.removeBranchContractor(this.branchForContractors.id, link.userId).pipe(
      timeout(8000),
      catchError((err) => {
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
    this.editingMasterUser = null;
    this.masterUserResetResult = null;
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
      companyCode: (client as any).companyCode || '',
      industry: (client as any).industry || '',
      state: (client as any).state || '',
      registeredAddress: (client as any).registeredAddress || '',
      primaryContactName: (client as any).primaryContactName || '',
      primaryContactEmail: (client as any).primaryContactEmail || '',
      primaryContactMobile: (client as any).primaryContactMobile || '',
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
      catchError((err) => {
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

  resetMasterUserPassword(userId: string) {
    if (!confirm('Reset this user\'s password? A new password will be generated.')) return;

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
    if (this.logoUploadMode === 'file') {
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
    } else {
      if (!this.svgCodeInput.trim()) { this.logoUploadError = 'Paste SVG code first'; return; }
      this.uploadingLogo = true;
      this.logoUploadMessage = '';
      this.logoUploadError = '';
      this.service.uploadSvgCode(this.selectedClient.id, this.svgCodeInput.trim()).pipe(
        timeout(15000),
        catchError((err) => { this.logoUploadError = err.error?.message || 'Upload failed'; return of(null); }),
        finalize(() => { this.uploadingLogo = false; this.cdr.detectChanges(); }),
        takeUntil(this.destroy$),
      ).subscribe((res) => {
        if (res) {
          this.logoUploadMessage = 'SVG logo saved successfully';
          this.selectedClient!.logoUrl = res.logoUrl;
          this.svgCodeInput = '';
        }
      });
    }
  }

  getAuthenticatedLogoUrl(url: string): string {
    return this.auth.authenticateUrl(url);
  }
}
