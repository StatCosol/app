import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import {
  ClraApiService,
  ClraAssignment,
  ClraContractor,
  ClraPeEstablishment,
  ClraWorker,
  CreateAssignmentPayload,
  CreateContractorPayload,
  CreatePeEstablishmentPayload,
  CreateWorkerPayload,
} from '../../../core/clra-api.service';
import {
  ActionButtonComponent,
  DataTableComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { CrmClraAssignmentDetailComponent } from './crm-clra-assignment-detail.component';

type WorkspaceTab = 'pe' | 'contractors' | 'workers' | 'assignments';

const WORKER_CATEGORIES = ['SKILLED', 'SEMI_SKILLED', 'UNSKILLED', 'HIGHLY_SKILLED'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

@Component({
  selector: 'app-crm-clra-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    CrmClraAssignmentDetailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page p-6">
      <ui-page-header title="CLRA Workspace" [subtitle]="'Client: ' + (clientId || '—')">
        <a slot="actions" [routerLink]="['/crm/clients', clientId, 'overview']" class="text-sm text-emerald-700 hover:underline">
          Back to client
        </a>
      </ui-page-header>

      <div class="flex flex-wrap gap-2 mt-4">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-lg border"
            [class.bg-emerald-600]="activeTab === t.id"
            [class.text-white]="activeTab === t.id"
            [class.border-emerald-600]="activeTab === t.id"
            [class.border-gray-200]="activeTab !== t.id"
            [class.text-gray-700]="activeTab !== t.id"
            (click)="setTab(t.id)">
            {{ t.label }}
          </button>
        }
      </div>

      @if (loading) {
        <div class="mt-6"><ui-loading-spinner /></div>
      }

      @if (!loading && activeTab === 'pe') {
        <div class="mt-6">
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm text-gray-600">{{ peEstablishments.length }} PE establishment(s)</span>
            <ui-button variant="primary" (clicked)="openPeForm()">+ Add PE Establishment</ui-button>
          </div>
          <ui-data-table [columns]="peCols" [data]="peEstablishments" emptyMessage="No PE establishments yet.">
            <ng-template uiTableCell="stateCode" let-row>{{ row.stateCode }}</ng-template>
            <ng-template uiTableCell="actions" let-row>
              <button class="text-blue-600 hover:underline text-sm" (click)="openPeForm(row)">Edit</button>
            </ng-template>
          </ui-data-table>
        </div>
      }

      @if (!loading && activeTab === 'contractors') {
        <div class="mt-6">
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm text-gray-600">{{ contractors.length }} contractor(s)</span>
            <ui-button variant="primary" (clicked)="openContractorForm()">+ Add Contractor</ui-button>
          </div>
          <ui-data-table [columns]="contractorCols" [data]="contractors" emptyMessage="No CLRA contractors registered.">
            <ng-template uiTableCell="actions" let-row>
              <button class="text-blue-600 hover:underline text-sm" (click)="openContractorForm(row)">Edit</button>
            </ng-template>
          </ui-data-table>
        </div>
      }

      @if (!loading && activeTab === 'workers') {
        <div class="mt-6">
          <div class="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contractor</label>
              <select [(ngModel)]="workerContractorId" (ngModelChange)="loadWorkers()" class="rounded-lg border-gray-300 min-w-[240px]">
                <option value="">Select contractor</option>
                @for (c of contractors; track c.id) {
                  <option [value]="c.id">{{ c.contractorCode }} — {{ c.legalName }}</option>
                }
              </select>
            </div>
            @if (workerContractorId) {
              <ui-button variant="primary" (clicked)="openWorkerForm()">+ Add Worker</ui-button>
            }
          </div>
          @if (!workerContractorId) {
            <ui-empty-state message="Select a contractor to manage workers." />
          } @else {
            <ui-data-table [columns]="workerCols" [data]="workers" emptyMessage="No workers for this contractor.">
              <ng-template uiTableCell="category" let-row>{{ row.category || '—' }}</ng-template>
              <ng-template uiTableCell="actions" let-row>
                <button class="text-blue-600 hover:underline text-sm" (click)="openWorkerForm(row)">Edit</button>
              </ng-template>
            </ui-data-table>
          }
        </div>
      }

      @if (!loading && activeTab === 'assignments') {
        <div class="mt-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PE Establishment</label>
              <select [(ngModel)]="filterPeId" (ngModelChange)="loadAssignments()" class="w-full rounded-lg border-gray-300">
                <option value="">All</option>
                @for (pe of peEstablishments; track pe.id) {
                  <option [value]="pe.id">{{ pe.peName }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contractor</label>
              <select [(ngModel)]="filterContractorId" (ngModelChange)="loadAssignments()" class="w-full rounded-lg border-gray-300">
                <option value="">All</option>
                @for (c of contractors; track c.id) {
                  <option [value]="c.id">{{ c.legalName }}</option>
                }
              </select>
            </div>
            <div class="flex items-end">
              <ui-button variant="primary" (clicked)="openAssignmentForm()">+ Add Assignment</ui-button>
            </div>
          </div>
          <ui-data-table [columns]="assignmentCols" [data]="assignments" emptyMessage="No assignments found.">
            <ng-template uiTableCell="contractor" let-row>{{ row.contractor?.legalName || row.contractorId }}</ng-template>
            <ng-template uiTableCell="pe" let-row>{{ row.peEstablishment?.peName || row.peEstablishmentId }}</ng-template>
            <ng-template uiTableCell="status" let-row><ui-status-badge [label]="row.status || 'ACTIVE'" /></ng-template>
            <ng-template uiTableCell="actions" let-row>
              <div class="flex gap-2">
                <button class="text-emerald-700 hover:underline text-sm" (click)="selectAssignment(row)">Manage</button>
                <button class="text-blue-600 hover:underline text-sm" (click)="openAssignmentForm(row)">Edit</button>
              </div>
            </ng-template>
          </ui-data-table>

          @if (selectedAssignment) {
            <app-crm-clra-assignment-detail
              [assignment]="selectedAssignment"
              [contractors]="contractors" />
          }
        </div>
      }
    </div>

    @if (showPeForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ peForm.id ? 'Edit' : 'Add' }} PE Establishment</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PE Name *</label>
              <input type="text" [(ngModel)]="peForm.peName" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Establishment Name *</label>
              <input type="text" [(ngModel)]="peForm.establishmentName" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State Code *</label>
              <input type="text" maxlength="10" [(ngModel)]="peForm.stateCode" class="w-full rounded-lg border-gray-300 uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Establishment Code</label>
              <input type="text" [(ngModel)]="peForm.establishmentCode" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Registration Cert. No.</label>
              <input type="text" [(ngModel)]="peForm.registrationCertificateNo" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
              <input type="text" [(ngModel)]="peForm.unitType" placeholder="FACTORY" class="w-full rounded-lg border-gray-300" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
              <input type="text" [(ngModel)]="peForm.addressLine1" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" [(ngModel)]="peForm.city" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
              <input type="text" [(ngModel)]="peForm.pincode" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="savePe()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showContractorForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ contractorForm.id ? 'Edit' : 'Add' }} Contractor</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input type="text" [(ngModel)]="contractorForm.contractorCode" class="w-full rounded-lg border-gray-300" [disabled]="!!contractorForm.id" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Legal Name *</label>
              <input type="text" [(ngModel)]="contractorForm.legalName" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Trade Name</label>
              <input type="text" [(ngModel)]="contractorForm.tradeName" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
              <input type="text" [(ngModel)]="contractorForm.contactPerson" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
              <input type="text" [(ngModel)]="contractorForm.mobile" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" [(ngModel)]="contractorForm.email" class="w-full rounded-lg border-gray-300" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Portal User ID</label>
              <input type="text" [(ngModel)]="contractorForm.contractorUserId" placeholder="UUID of contractor portal login (optional)" class="w-full rounded-lg border-gray-300 font-mono text-xs" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PAN</label>
              <input type="text" [(ngModel)]="contractorForm.pan" class="w-full rounded-lg border-gray-300 uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
              <input type="text" [(ngModel)]="contractorForm.gstin" class="w-full rounded-lg border-gray-300 uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State Code</label>
              <input type="text" [(ngModel)]="contractorForm.stateCode" class="w-full rounded-lg border-gray-300 uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" [(ngModel)]="contractorForm.city" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveContractor()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showWorkerForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ workerForm.id ? 'Edit' : 'Add' }} Worker</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Worker Code *</label>
              <input type="text" [(ngModel)]="workerForm.workerCode" class="w-full rounded-lg border-gray-300" [disabled]="!!workerForm.id" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input type="text" [(ngModel)]="workerForm.fullName" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Father/Spouse</label>
              <input type="text" [(ngModel)]="workerForm.fatherOrSpouseName" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select [(ngModel)]="workerForm.gender" class="w-full rounded-lg border-gray-300">
                <option value="">—</option>
                @for (g of genders; track g) { <option [value]="g">{{ g }}</option> }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select [(ngModel)]="workerForm.category" class="w-full rounded-lg border-gray-300">
                <option value="">—</option>
                @for (c of workerCategories; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <input type="text" [(ngModel)]="workerForm.designation" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">UAN</label>
              <input type="text" [(ngModel)]="workerForm.uan" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ESI No.</label>
              <input type="text" [(ngModel)]="workerForm.esiNo" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
              <input type="date" [(ngModel)]="workerForm.dateOfJoining" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
              <input type="text" [(ngModel)]="workerForm.mobile" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveWorker()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showAssignmentForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ assignmentForm.id ? 'Edit' : 'Add' }} Assignment</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contractor *</label>
              <select [(ngModel)]="assignmentForm.contractorId" class="w-full rounded-lg border-gray-300">
                @for (c of contractors; track c.id) {
                  <option [value]="c.id">{{ c.legalName }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PE Establishment *</label>
              <select [(ngModel)]="assignmentForm.peEstablishmentId" class="w-full rounded-lg border-gray-300">
                @for (pe of peEstablishments; track pe.id) {
                  <option [value]="pe.id">{{ pe.peName }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Assignment Code *</label>
              <input type="text" [(ngModel)]="assignmentForm.assignmentCode" class="w-full rounded-lg border-gray-300" [disabled]="!!assignmentForm.id" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nature of Work *</label>
              <input type="text" [(ngModel)]="assignmentForm.natureOfWork" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State Code *</label>
              <input type="text" [(ngModel)]="assignmentForm.stateCode" class="w-full rounded-lg border-gray-300 uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Licence No.</label>
              <input type="text" [(ngModel)]="assignmentForm.licenceNo" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" [(ngModel)]="assignmentForm.startDate" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" [(ngModel)]="assignmentForm.endDate" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Max Workmen</label>
              <input type="number" [(ngModel)]="assignmentForm.maximumWorkmen" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Wage Period Type</label>
              <select [(ngModel)]="assignmentForm.wagePeriodType" class="w-full rounded-lg border-gray-300">
                <option value="MONTHLY">MONTHLY</option>
                <option value="WEEKLY">WEEKLY</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Work Location</label>
              <input type="text" [(ngModel)]="assignmentForm.workLocationName" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveAssignment()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CrmClraWorkspaceComponent implements OnInit {
  readonly tabs = [
    { id: 'pe' as WorkspaceTab, label: 'PE Establishments' },
    { id: 'contractors' as WorkspaceTab, label: 'Contractors' },
    { id: 'workers' as WorkspaceTab, label: 'Workers' },
    { id: 'assignments' as WorkspaceTab, label: 'Assignments' },
  ];
  readonly workerCategories = WORKER_CATEGORIES;
  readonly genders = GENDERS;

  readonly peCols: TableColumn[] = [
    { key: 'peName', header: 'PE Name' },
    { key: 'establishmentName', header: 'Establishment' },
    { key: 'stateCode', header: 'State' },
    { key: 'establishmentCode', header: 'Code' },
    { key: 'actions', header: '' },
  ];
  readonly contractorCols: TableColumn[] = [
    { key: 'contractorCode', header: 'Code' },
    { key: 'legalName', header: 'Legal Name' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'stateCode', header: 'State' },
    { key: 'actions', header: '' },
  ];
  readonly workerCols: TableColumn[] = [
    { key: 'workerCode', header: 'Code' },
    { key: 'fullName', header: 'Name' },
    { key: 'designation', header: 'Designation' },
    { key: 'category', header: 'Category' },
    { key: 'actions', header: '' },
  ];
  readonly assignmentCols: TableColumn[] = [
    { key: 'assignmentCode', header: 'Code' },
    { key: 'contractor', header: 'Contractor' },
    { key: 'pe', header: 'PE' },
    { key: 'natureOfWork', header: 'Work' },
    { key: 'startDate', header: 'Start' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: '' },
  ];

  clientId = '';
  activeTab: WorkspaceTab = 'pe';
  loading = false;
  saving = false;

  peEstablishments: ClraPeEstablishment[] = [];
  contractors: ClraContractor[] = [];
  workers: ClraWorker[] = [];
  assignments: ClraAssignment[] = [];
  selectedAssignment: ClraAssignment | null = null;

  workerContractorId = '';
  filterPeId = '';
  filterContractorId = '';

  showPeForm = false;
  showContractorForm = false;
  showWorkerForm = false;
  showAssignmentForm = false;

  peForm: CreatePeEstablishmentPayload & { id?: string } = this.emptyPeForm();
  contractorForm: CreateContractorPayload & { id?: string } = this.emptyContractorForm();
  workerForm: CreateWorkerPayload & { id?: string } = this.emptyWorkerForm();
  assignmentForm: CreateAssignmentPayload & { id?: string } = this.emptyAssignmentForm();

  constructor(
    private route: ActivatedRoute,
    private clra: ClraApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (!this.clientId) return;
    this.reloadMasters();
  }

  setTab(tab: WorkspaceTab): void {
    this.activeTab = tab;
    if (tab === 'workers' && this.workerContractorId) this.loadWorkers();
    if (tab === 'assignments') this.loadAssignments();
    this.cdr.markForCheck();
  }

  selectAssignment(row: ClraAssignment): void {
    this.selectedAssignment = row;
    this.cdr.markForCheck();
  }

  openPeForm(row?: ClraPeEstablishment): void {
    if (row) {
      this.peForm = {
        id: row.id,
        clientId: row.clientId,
        peName: row.peName,
        establishmentName: row.establishmentName,
        stateCode: row.stateCode,
        establishmentCode: row.establishmentCode || undefined,
        registrationCertificateNo: row.registrationCertificateNo || undefined,
        addressLine1: row.addressLine1 || undefined,
        city: row.city || undefined,
        pincode: row.pincode || undefined,
        unitType: row.unitType || undefined,
      };
    } else {
      this.peForm = this.emptyPeForm();
    }
    this.showPeForm = true;
    this.cdr.markForCheck();
  }

  openContractorForm(row?: ClraContractor): void {
    if (row) {
      this.contractorForm = {
        id: row.id,
        contractorCode: row.contractorCode,
        legalName: row.legalName,
        tradeName: row.tradeName || undefined,
        contactPerson: row.contactPerson || undefined,
        mobile: row.mobile || undefined,
        email: row.email || undefined,
        pan: row.pan || undefined,
        gstin: row.gstin || undefined,
        stateCode: row.stateCode || undefined,
        city: row.city || undefined,
        contractorUserId: row.contractorUserId || undefined,
      };
    } else {
      this.contractorForm = this.emptyContractorForm();
    }
    this.showContractorForm = true;
    this.cdr.markForCheck();
  }

  openWorkerForm(row?: ClraWorker): void {
    if (!this.workerContractorId && !row) return;
    if (row) {
      this.workerForm = {
        id: row.id,
        contractorId: row.contractorId,
        workerCode: row.workerCode,
        fullName: row.fullName,
        fatherOrSpouseName: row.fatherOrSpouseName || undefined,
        gender: row.gender || undefined,
        category: row.category || undefined,
        designation: row.designation || undefined,
        uan: row.uan || undefined,
        esiNo: row.esiNo || undefined,
        dateOfJoining: row.dateOfJoining || undefined,
        mobile: row.mobile || undefined,
      };
    } else {
      this.workerForm = this.emptyWorkerForm();
    }
    this.showWorkerForm = true;
    this.cdr.markForCheck();
  }

  openAssignmentForm(row?: ClraAssignment): void {
    if (row) {
      this.assignmentForm = {
        id: row.id,
        contractorId: row.contractorId,
        peEstablishmentId: row.peEstablishmentId,
        assignmentCode: row.assignmentCode,
        natureOfWork: row.natureOfWork,
        stateCode: row.stateCode,
        startDate: row.startDate,
        licenceNo: row.licenceNo || undefined,
        endDate: row.endDate || undefined,
        maximumWorkmen: row.maximumWorkmen ?? undefined,
        wagePeriodType: row.wagePeriodType || 'MONTHLY',
        workLocationName: row.workLocationName || undefined,
      };
    } else {
      this.assignmentForm = this.emptyAssignmentForm();
    }
    this.showAssignmentForm = true;
    this.cdr.markForCheck();
  }

  closeForms(): void {
    this.showPeForm = false;
    this.showContractorForm = false;
    this.showWorkerForm = false;
    this.showAssignmentForm = false;
    this.cdr.markForCheck();
  }

  savePe(): void {
    if (!this.peForm.peName || !this.peForm.establishmentName || !this.peForm.stateCode) {
      this.toast.error('Validation', 'PE name, establishment name, and state are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const { id, ...body } = this.peForm;
    const req = id
      ? this.clra.updatePeEstablishment(id, body)
      : this.clra.createPeEstablishment({ ...body, clientId: this.clientId });
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Saved', 'PE establishment saved.');
        this.closeForms();
        this.loadPeEstablishments();
      },
      error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save PE establishment.'),
    });
  }

  saveContractor(): void {
    if (!this.contractorForm.contractorCode || !this.contractorForm.legalName) {
      this.toast.error('Validation', 'Code and legal name are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const { id, ...body } = this.contractorForm;
    const req = id ? this.clra.updateContractor(id, body) : this.clra.createContractor(body);
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Saved', 'Contractor saved.');
        this.closeForms();
        this.loadContractors();
      },
      error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save contractor.'),
    });
  }

  saveWorker(): void {
    if (!this.workerForm.workerCode || !this.workerForm.fullName) {
      this.toast.error('Validation', 'Worker code and name are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const { id, ...body } = this.workerForm;
    const req = id ? this.clra.updateWorker(id, body) : this.clra.createWorker(body);
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Saved', 'Worker saved.');
        this.closeForms();
        this.loadWorkers();
      },
      error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save worker.'),
    });
  }

  saveAssignment(): void {
    if (!this.assignmentForm.contractorId || !this.assignmentForm.peEstablishmentId ||
        !this.assignmentForm.assignmentCode || !this.assignmentForm.natureOfWork ||
        !this.assignmentForm.stateCode || !this.assignmentForm.startDate) {
      this.toast.error('Validation', 'Fill all required assignment fields.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const { id, ...body } = this.assignmentForm;
    const req = id ? this.clra.updateAssignment(id, body) : this.clra.createAssignment(body);
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Saved', 'Assignment saved.');
        this.closeForms();
        this.loadAssignments();
      },
      error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save assignment.'),
    });
  }

  loadWorkers(): void {
    if (!this.workerContractorId) {
      this.workers = [];
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.cdr.markForCheck();
    this.clra
      .listWorkers(this.workerContractorId)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => {
          this.workers = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.workers = [];
          this.cdr.markForCheck();
        },
      });
  }

  loadAssignments(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.clra
      .listAssignments(this.filterContractorId || undefined, this.filterPeId || undefined)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => {
          this.assignments = rows || [];
          if (this.selectedAssignment) {
            this.selectedAssignment = this.assignments.find((a) => a.id === this.selectedAssignment!.id) || null;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.assignments = [];
          this.cdr.markForCheck();
        },
      });
  }

  private reloadMasters(): void {
    this.loading = true;
    this.cdr.markForCheck();
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    };
    this.loadPeEstablishments(done);
    this.loadContractors(done);
  }

  private loadPeEstablishments(done?: () => void): void {
    this.clra
      .listPeEstablishments(this.clientId)
      .pipe(finalize(() => done?.()))
      .subscribe({
        next: (rows) => {
          this.peEstablishments = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.peEstablishments = [];
          this.cdr.markForCheck();
        },
      });
  }

  private loadContractors(done?: () => void): void {
    this.clra
      .listContractors()
      .pipe(finalize(() => done?.()))
      .subscribe({
        next: (rows) => {
          this.contractors = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.contractors = [];
          this.cdr.markForCheck();
        },
      });
  }

  private emptyPeForm(): CreatePeEstablishmentPayload & { id?: string } {
    return { clientId: this.clientId, peName: '', establishmentName: '', stateCode: '', unitType: 'FACTORY' };
  }

  private emptyContractorForm(): CreateContractorPayload & { id?: string } {
    return { contractorCode: '', legalName: '' };
  }

  private emptyWorkerForm(): CreateWorkerPayload & { id?: string } {
    return { contractorId: this.workerContractorId, workerCode: '', fullName: '' };
  }

  private emptyAssignmentForm(): CreateAssignmentPayload & { id?: string } {
    const pe = this.peEstablishments[0];
    const contractor = this.contractors[0];
    return {
      contractorId: contractor?.id || '',
      peEstablishmentId: pe?.id || '',
      assignmentCode: '',
      natureOfWork: '',
      stateCode: pe?.stateCode || '',
      startDate: new Date().toISOString().slice(0, 10),
      wagePeriodType: 'MONTHLY',
    };
  }
}
