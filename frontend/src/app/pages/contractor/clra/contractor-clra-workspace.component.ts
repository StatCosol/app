import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  ClraApiService,
  ClraAssignment,
  ClraContractor,
  ClraWorker,
  CreateWorkerPayload,
} from '../../../core/clra-api.service';
import {
  ActionButtonComponent,
  DataTableComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { CrmClraAssignmentDetailComponent } from '../../crm/clra/crm-clra-assignment-detail.component';

type Tab = 'assignments' | 'workers';

const WORKER_CATEGORIES = ['SKILLED', 'SEMI_SKILLED', 'UNSKILLED', 'HIGHLY_SKILLED'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

@Component({
  selector: 'app-contractor-clra-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    CrmClraAssignmentDetailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page p-6">
      <ui-page-header
        title="CLRA Compliance"
        [subtitle]="contractor ? contractor.legalName + ' (' + contractor.contractorCode + ')' : 'Contract labour registers & wage records'">
      </ui-page-header>

      @if (loading) {
        <div class="mt-6"><ui-loading-spinner /></div>
      } @else if (linkError) {
        <div class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {{ linkError }}
        </div>
      } @else {
        <div class="flex gap-2 mt-4">
          <button type="button" class="px-4 py-2 text-sm font-medium rounded-lg border"
            [class.bg-rose-600]="tab === 'assignments'" [class.text-white]="tab === 'assignments'"
            [class.border-rose-600]="tab === 'assignments'"
            (click)="setTab('assignments')">Assignments</button>
          <button type="button" class="px-4 py-2 text-sm font-medium rounded-lg border"
            [class.bg-rose-600]="tab === 'workers'" [class.text-white]="tab === 'workers'"
            [class.border-rose-600]="tab === 'workers'"
            (click)="setTab('workers')">Workers</button>
        </div>

        @if (tab === 'assignments') {
          <div class="mt-6">
            <ui-data-table [columns]="assignmentCols" [data]="assignments" emptyMessage="No CLRA assignments linked to your account.">
              <ng-template uiTableCell="pe" let-row>{{ row.peEstablishment?.peName || row.peEstablishmentId }}</ng-template>
              <ng-template uiTableCell="actions" let-row>
                <button class="text-rose-700 hover:underline text-sm" (click)="selectAssignment(row)">Manage</button>
              </ng-template>
            </ui-data-table>
            @if (selectedAssignment) {
              <app-crm-clra-assignment-detail
                [assignment]="selectedAssignment"
                [portalMode]="true" />
            }
          </div>
        }

        @if (tab === 'workers') {
          <div class="mt-6">
            <div class="flex justify-between items-center mb-3">
              <span class="text-sm text-gray-600">{{ workers.length }} worker(s)</span>
              <ui-button variant="primary" (clicked)="openWorkerForm()">+ Add Worker</ui-button>
            </div>
            <ui-data-table [columns]="workerCols" [data]="workers" emptyMessage="No CLRA workers yet.">
              <ng-template uiTableCell="category" let-row>{{ row.category || '—' }}</ng-template>
              <ng-template uiTableCell="actions" let-row>
                <button class="text-brand-600 hover:underline text-sm" (click)="openWorkerForm(row)">Edit</button>
              </ng-template>
            </ui-data-table>
          </div>
        }
      }
    </div>

    @if (showWorkerForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeWorkerForm()">
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
              <label class="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
              <input type="text" [(ngModel)]="workerForm.mobile" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeWorkerForm()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveWorker()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ContractorClraWorkspaceComponent implements OnInit {
  readonly workerCategories = WORKER_CATEGORIES;
  readonly assignmentCols: TableColumn[] = [
    { key: 'assignmentCode', header: 'Code' },
    { key: 'pe', header: 'PE Establishment' },
    { key: 'natureOfWork', header: 'Work' },
    { key: 'startDate', header: 'Start' },
    { key: 'actions', header: '' },
  ];
  readonly workerCols: TableColumn[] = [
    { key: 'workerCode', header: 'Code' },
    { key: 'fullName', header: 'Name' },
    { key: 'designation', header: 'Designation' },
    { key: 'category', header: 'Category' },
    { key: 'actions', header: '' },
  ];

  loading = true;
  saving = false;
  linkError = '';
  tab: Tab = 'assignments';
  contractor: ClraContractor | null = null;
  assignments: ClraAssignment[] = [];
  workers: ClraWorker[] = [];
  selectedAssignment: ClraAssignment | null = null;
  showWorkerForm = false;
  workerForm: CreateWorkerPayload & { id?: string } = { contractorId: '', workerCode: '', fullName: '' };

  constructor(
    private clra: ClraApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    if (tab === 'workers') this.loadWorkers();
    this.cdr.markForCheck();
  }

  selectAssignment(row: ClraAssignment): void {
    this.selectedAssignment = row;
    this.cdr.markForCheck();
  }

  openWorkerForm(row?: ClraWorker): void {
    if (row) {
      this.workerForm = {
        id: row.id,
        contractorId: row.contractorId,
        workerCode: row.workerCode,
        fullName: row.fullName,
        category: row.category || undefined,
        designation: row.designation || undefined,
        uan: row.uan || undefined,
        mobile: row.mobile || undefined,
      };
    } else {
      this.workerForm = {
        contractorId: this.contractor?.id || '',
        workerCode: '',
        fullName: '',
      };
    }
    this.showWorkerForm = true;
    this.cdr.markForCheck();
  }

  closeWorkerForm(): void {
    this.showWorkerForm = false;
    this.cdr.markForCheck();
  }

  saveWorker(): void {
    if (!this.workerForm.workerCode || !this.workerForm.fullName) {
      this.toast.error('Validation', 'Worker code and name are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const { id, contractorId: _c, ...body } = this.workerForm;
    const req = id
      ? this.clra.updateMyWorker(id, body)
      : this.clra.createMyWorker(body);
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Saved', 'Worker saved.');
        this.closeWorkerForm();
        this.loadWorkers();
      },
      error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save worker.'),
    });
  }

  private reload(): void {
    this.loading = true;
    this.linkError = '';
    this.cdr.markForCheck();
    this.clra.getMyContractor().pipe(finalize(() => {
      this.loading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (c) => {
        this.contractor = c;
        this.loadAssignments();
        this.loadWorkers();
      },
      error: (err) => {
        this.linkError = err?.error?.message || 'Your account is not linked to a CLRA contractor profile. Ask your CRM team to link your portal user.';
        this.cdr.markForCheck();
      },
    });
  }

  private loadAssignments(): void {
    this.clra.listMyAssignments().subscribe({
      next: (rows) => {
        this.assignments = rows || [];
        this.cdr.markForCheck();
      },
    });
  }

  private loadWorkers(): void {
    this.clra.listMyWorkers().subscribe({
      next: (rows) => {
        this.workers = rows || [];
        this.cdr.markForCheck();
      },
    });
  }
}
