import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink, NavigationEnd } from '@angular/router';
import { finalize, timeout, catchError } from 'rxjs/operators';
import { of, Subscription, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AdminClientsService, Client, Branch, BranchComplianceApplicability, ClientUserLink, ClientUserOption, BranchContractorLink, ContractorOption } from './admin-clients.service';
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

  // Client section
  clients: Client[] = [];
  selectedClient: Client | null = null;
  clientForm = {
    clientName: ''
  };

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
    branchUserPassword: ''
  };
  editingBranchId: string | null = null;

  createdBranchUser: { email: string; password: string } | null = null;

  stateOptions = [
    { code: 'AN', name: 'Andaman & Nicobar' },
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' },
    { code: 'CH', name: 'Chandigarh' },
    { code: 'CT', name: 'Chhattisgarh' },
    { code: 'DN', name: 'Dadra & Nagar Haveli and Daman & Diu' },
    { code: 'DL', name: 'Delhi' },
    { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JK', name: 'Jammu & Kashmir' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'LA', name: 'Ladakh' },
    { code: 'LD', name: 'Lakshadweep' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' },
    { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' },
    { code: 'OR', name: 'Odisha' },
    { code: 'PY', name: 'Puducherry' },
    { code: 'PB', name: 'Punjab' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TS', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'UT', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
  ];

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
  loading = false;
  error = '';
  success = '';

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
    { value: 'ESTABLISHMENT', label: 'Establishment' },
    { value: 'FACTORY', label: 'Factory' },
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
      // User needs to select a branch first
    }
  }

  // CLIENT OPERATIONS
  loadClients() {
    this.error = '';
    this.loading = true;
    const safetyTimer = setTimeout(() => {
      if (this.loading) {
        console.warn('[AdminClients] loadClients safety timeout fired');
        this.loading = false;
        this.cdr.detectChanges();
      }
    }, 8000);
    this.service.getClients().pipe(
      timeout(20000),
      catchError((err) => {
        console.error('[AdminClients] Load clients error:', err);
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

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.createClient({ clientName: name }).pipe(
      timeout(8000),
      catchError((err) => {
        console.error('Create client error:', err);
        this.error = err.error?.message || 'Failed to create client';
        throw err;
      }),
      finalize(() => this.loading = false)
    ).subscribe({
      next: (res) => {
        this.success = 'Client created successfully';
        this.clientForm.clientName = '';
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

  deleteClient(client: Client) {
    if (!client?.id) return;

    const label = client.clientName || `Client #${client.id}`;
    if (!confirm(`Deactivate client: ${label}?`)) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.deleteClient(client.id).pipe(
      timeout(8000),
      catchError((err) => {
        console.error('Delete client error:', err);
        this.error = err.error?.message || 'Failed to delete client';
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
      }),
    ).subscribe({
      next: (res) => {
        if (res) {
          this.success = 'Client deleted';
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
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (client) => {
        this.selectedClient = client;
        this.activeTab = tab || 'branches';
        this.loadBranches();
        this.loadClientUsers(client.id);
        this.loadAvailableClientUsers();
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
        console.error('Load client users error:', err);
        this.error = 'Failed to load client users';
        return of([] as ClientUserLink[]);
      })
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
        console.error('Load CLIENT users error:', err);
        return of([] as ClientUserOption[]);
      })
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
        console.error('Link client user error:', err);
        this.error = err.error?.message || 'Failed to link client user';
        throw err;
      }),
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

  unlinkClientUser(link: ClientUserLink) {
    if (!this.selectedClient) return;
    if (!confirm(`Unlink client user ${link.name} (${link.email})?`)) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.service.removeClientUser(this.selectedClient.id, link.userId).pipe(
      timeout(8000),
      catchError((err) => {
        console.error('Unlink client user error:', err);
        this.error = 'Failed to unlink client user';
        return of(null);
      }),
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
        console.error('Load branches error:', err);
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
      finalize(() => this.loading = false)
    ).subscribe({
      next: (res) => {
        this.deferUi(() => {
          this.branches = res || [];
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
      catchError((_err) => {
        this.error = 'Failed to delete branch';
        return of(null);
      })
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
      branchUserPassword: ''
    } as any;

    this.deferUi(() => {
      this.editingBranchId = null;
      this.branchForm = { ...defaults };
      this.createdBranchUser = null;
      this.branchUserErrorMessage = '';
    });
  }

  // COMPLIANCE OPERATIONS
  loadCompliances() {
    this.service.getCompliances().pipe(
      timeout(8000),
      catchError((err) => {
        console.error('Load compliances error:', err);
        return of([]);
      })
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
    
    // Navigate to compliances tab
    if (this.selectedClient) {
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
        console.error('Recompute compliances error:', err);
        return of(null);
      }),
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
        console.error('Load branch compliances error:', err);
        return of([]);
      })
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
        console.error('Load branch contractors error:', err);
        this.error = 'Failed to load branch contractors';
        return of([] as BranchContractorLink[]);
      })
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
        console.error('Load contractor users error:', err);
        return of([] as ContractorOption[]);
      })
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
        console.error('Link contractor error:', err);
        this.error = err.error?.message || 'Failed to link contractor';
        throw err;
      }),
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
        console.error('Unlink contractor error:', err);
        this.error = 'Failed to unlink contractor';
        return of(null);
      }),
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
}
