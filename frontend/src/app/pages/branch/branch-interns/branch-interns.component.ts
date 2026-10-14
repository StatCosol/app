import { ClientPayrollSettingsService } from '../../../core/client-payroll-settings.service';
import { FaceDeskComponent } from '../../client/facedesk/facedesk.component';
import { Input, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from '../../client/employees/client-employees.service';
import { ClientPayrollService, EmployeePayrollRecord } from '../../../core/client-payroll.service';
import { AuthService } from '../../../core/auth.service';
import { BranchMarkAttendanceComponent } from '../branch-attendance/branch-mark-attendance.component';
import { loadAllPages } from '../../../shared/utils/load-all-pages';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-branch-interns',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BranchMarkAttendanceComponent,
    FaceDeskComponent,
  ],
  template: `
    <div class="p-6 space-y-5">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">Interns</h1>
          <p class="text-gray-500">
            {{
              clientMode
                ? 'Intern information and attendance across your branches.'
                : 'Enrollment, internship agreements, attendance and stipend receipts for your branch.'
            }}
          </p>
        </div>
        @if (!clientMode) {
          <a class="px-4 py-2 bg-brand-600 text-white rounded" routerLink="/branch/interns/new"
            >Enroll Intern</a
          >
        }
      </header>
      @if (clientMode) {
        <label class="block"
          >Branch
          <select
            class="border rounded p-2"
            name="internBranch"
            [(ngModel)]="branchId"
            (change)="branchChanged()"
          >
            <option value="">All branches</option>
            @for (branch of branches; track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select></label
        >
        <div class="flex flex-wrap gap-3" aria-label="Intern counts by branch">
          @for (branch of branches; track branch.id) {
            <button
              type="button"
              class="border rounded p-3 text-left"
              [attr.aria-pressed]="branchId === branch.id"
              (click)="branchId = branch.id; branchChanged()"
            >
              <strong>{{ branch.name }}</strong
              ><br />{{ branchCount(branch.id) }} interns ·
              {{ branchCount(branch.id, true) }} active
            </button>
          }
        </div>
      }

      <nav class="flex flex-wrap gap-3" aria-label="Intern sections">
        <button
          type="button"
          class="px-4 py-2 border rounded"
          [attr.aria-pressed]="tab === 'enrollment'"
          (click)="tab = 'enrollment'"
        >
          Enrollment & Agreements
        </button>
        <button
          type="button"
          class="px-4 py-2 border rounded"
          [attr.aria-pressed]="tab === 'documents'"
          (click)="tab = 'documents'"
        >
          Documents
        </button>
        @if (auth.hasModule('CONTRACTOR_FACE_ATTENDANCE')) {
          <button
            type="button"
            class="px-4 py-2 border rounded"
            [attr.aria-pressed]="tab === 'facedesk'"
            (click)="tab = 'facedesk'"
          >
            FaceDesk Enrollment
          </button>
        }
        @if (auth.hasModule('EMPLOYEE_ATTENDANCE')) {
          <button
            type="button"
            class="px-4 py-2 border rounded"
            [attr.aria-pressed]="tab === 'attendance'"
            (click)="tab = 'attendance'"
          >
            Attendance
          </button>
        }
        @if (canViewReceipts) {
          <button
            type="button"
            class="px-4 py-2 border rounded"
            [attr.aria-pressed]="tab === 'receipts'"
            (click)="openReceipts()"
          >
            Stipend Receipts
          </button>
        }
      </nav>
      @if (error) {
        <p role="alert" class="text-red-700">{{ error }}</p>
      }
      @if (tab === 'enrollment') {
        <div class="flex gap-3">
          <label
            >Search interns
            <input class="border rounded p-2" name="internSearch" [(ngModel)]="search" /></label
          ><button type="button" (click)="load()">Refresh</button>
        </div>
        @if (loading) {
          <p>Loading interns…</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b">
                  <th class="p-3">Intern</th>
                  @if (clientMode) {
                    <th class="p-3">Branch</th>
                  }
                  <th class="p-3">Internship Period</th>
                  <th class="p-3">Monthly Stipend</th>
                  <th class="p-3">Status</th>
                  <th class="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (intern of filteredInterns; track intern.id) {
                  <tr class="border-b">
                    <td class="p-3">
                      {{ intern.name }}<br /><small>{{ intern.employeeCode }}</small>
                    </td>
                    @if (clientMode) {
                      <td class="p-3">{{ branchName(intern.branchId) }}</td>
                    }
                    <td class="p-3">
                      {{ intern.internshipStartDate || 'Start date required' }} to
                      {{ intern.internshipEndDate || 'End date required' }}
                    </td>
                    <td class="p-3">{{ intern.monthlyGross | currency: 'INR' }}</td>
                    <td class="p-3">
                      {{ intern.approvalStatus }} · {{ intern.isActive ? 'Active' : 'Inactive' }}
                    </td>
                    <td class="p-3">
                      <a
                        class="underline mr-3"
                        [routerLink]="
                          clientMode
                            ? ['/client/employees', intern.id]
                            : ['/branch/interns', intern.id, 'edit']
                        "
                        >Enrollment Details</a
                      ><button type="button" class="underline mr-3" (click)="openDocuments(intern)">
                        Documents</button
                      ><button
                        type="button"
                        class="underline"
                        [disabled]="
                          !!downloading || !intern.internshipStartDate || !intern.internshipEndDate
                        "
                        (click)="agreement(intern)"
                      >
                        Download Agreement
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="p-3" [attr.colspan]="clientMode ? 6 : 5">
                      No interns found. Enroll an intern to get started.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
      @if (tab === 'documents') {
        <section class="space-y-4 border rounded p-4">
          <h2 class="text-lg font-semibold">Intern Documents</h2>
          <label class="block"
            >Intern
            <select
              class="border rounded p-2"
              name="documentIntern"
              [(ngModel)]="documentInternId"
              (change)="loadDocuments()"
            >
              <option value="">Select an intern</option>
              @for (intern of scopedInterns; track intern.id) {
                <option [value]="intern.id">{{ intern.name }} · {{ intern.employeeCode }}</option>
              }
            </select></label
          >
          @if (documentInternId) {
            <label class="block"
              >Document type
              <select class="border rounded p-2" name="documentType" [(ngModel)]="documentType">
                <option value="AADHAAR">Aadhaar</option>
                <option value="PAN">PAN</option>
                <option value="EDUCATION">Education Certificate</option>
                <option value="BANK_DETAILS">Bank Details</option>
                <option value="INTERNSHIP_AGREEMENT">Signed Internship Agreement</option>
                <option value="STIPEND_RECEIPT">Signed Stipend Receipt</option>
                <option value="OTHER">Other</option>
              </select></label
            >
            <label class="block"
              >Document name
              <input
                class="border rounded p-2"
                name="documentName"
                [(ngModel)]="documentName"
                maxlength="255"
            /></label>
            <label class="block"
              >File (maximum 10 MB)
              <input
                #documentFile
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.txt"
                (change)="chooseFile($event)"
            /></label>
            <button
              type="button"
              class="px-4 py-2 border rounded"
              [disabled]="!file || uploading || documentsLoading"
              (click)="uploadDocument(documentFile)"
            >
              {{ uploading ? 'Uploading…' : 'Upload Document' }}
            </button>
            @if (documentSuccess) {
              <p role="status" class="text-green-700">{{ documentSuccess }}</p>
            }
            @if (documentsLoading) {
              <p>Loading documents…</p>
            } @else {
              <table class="w-full text-left">
                <thead>
                  <tr>
                    <th class="p-2">Document</th>
                    <th class="p-2">Type</th>
                    <th class="p-2">Uploaded</th>
                    <th class="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  @for (doc of documents; track doc.id) {
                    <tr class="border-b">
                      <td class="p-2">{{ doc.docName }}</td>
                      <td class="p-2">{{ doc.docType }}</td>
                      <td class="p-2">{{ doc.createdAt | date: 'mediumDate' }}</td>
                      <td class="p-2">
                        <button
                          type="button"
                          class="underline"
                          [disabled]="!!downloading"
                          (click)="downloadDocument(doc)"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="4" class="p-2">No documents uploaded for this intern.</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          }
        </section>
      }
      @if (tab === 'facedesk') {
        <app-facedesk [branchMode]="true" [internOnly]="true" [enrollmentBranchId]="branchId" />
      }
      @if (tab === 'attendance') {
        <app-branch-mark-attendance
          [internOnly]="true"
          [branchId]="branchId"
          [readOnly]="clientMode"
        />
      }
      @if (tab === 'receipts') {
        <label
          >Stipend month
          <input
            type="month"
            class="border rounded p-2"
            name="receiptMonth"
            [(ngModel)]="month"
            (change)="loadReceipts()"
        /></label>
        <p class="text-sm text-gray-500">
          Receipts are available after intern payroll is approved and payslips are published. Sign
          the receipt after payment.
        </p>
        @if (receiptLoading) {
          <p>Loading stipend receipts…</p>
        } @else {
          <table class="w-full text-left">
            <thead>
              <tr>
                <th class="p-3">Intern</th>
                <th class="p-3">Payroll Status</th>
                <th class="p-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              @for (record of receipts; track record.employeeCode) {
                <tr class="border-b">
                  <td class="p-3">{{ record.employeeName }} · {{ record.employeeCode }}</td>
                  <td class="p-3">{{ record.runStatus || 'Not processed' }}</td>
                  <td class="p-3">
                    <button
                      type="button"
                      class="underline"
                      [disabled]="!record.payslipAvailable || !record.runId || !!downloading"
                      (click)="receipt(record)"
                    >
                      Download Stipend Receipt
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="3" class="p-3">No intern payroll records for this month.</td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </div>
  `,
})
export class BranchInternsComponent implements OnInit, OnDestroy {
  @Input() clientMode = false;
  @Input() branches: { id: string; name: string }[] = [];
  branchId = '';
  get scopedInterns(): Employee[] {
    return this.branchId ? this.interns.filter((e) => e.branchId === this.branchId) : this.interns;
  }
  branchCount(id: string, activeOnly = false): number {
    return this.interns.filter((e) => e.branchId === id && (!activeOnly || e.isActive)).length;
  }
  branchName(id: string | null): string {
    return (
      this.branches.find((b) => b.id === id)?.name ||
      (id ? 'Branch name unavailable' : 'Unassigned')
    );
  }
  branchChanged(): void {
    this.documentInternId = '';
    this.loadDocuments();
    this.receipts = [];
    if (this.tab === 'receipts') this.loadReceipts();
  }
  tab: 'enrollment' | 'attendance' | 'receipts' | 'documents' | 'facedesk' = 'enrollment';
  interns: Employee[] = [];
  receipts: EmployeePayrollRecord[] = [];
  search = '';
  error = '';
  downloading = '';
  loading = false;
  receiptLoading = false;
  canViewReceipts = false;
  month = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  documentInternId = '';
  documentType = 'AADHAAR';
  documentName = '';
  documentSuccess = '';
  file: File | null = null;
  uploading = false;
  documentsLoading = false;
  documents: { id: string; docName: string; docType: string; createdAt: string }[] = [];
  private documentGeneration = 0;
  private destroy$ = new Subject<void>();
  private receiptGeneration = 0;
  constructor(
    private employees: ClientEmployeesService,
    private payroll: ClientPayrollService,
    private http: HttpClient,
    public auth: AuthService,
    private payrollSettings: ClientPayrollSettingsService,
  ) {}
  ngOnInit(): void {
    this.load();
    this.loadReceiptAccess();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  get filteredInterns(): Employee[] {
    const q = this.search.toLowerCase();
    return this.scopedInterns.filter((e) =>
      (e.name + ' ' + e.employeeCode).toLowerCase().includes(q),
    );
  }
  load(): void {
    this.loading = true;
    this.error = '';
    loadAllPages<Employee>((page) =>
      this.employees.list({ limit: 1000, offset: (page - 1) * 1000 }),
    )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (rows) => {
          this.interns = rows.filter((e) => e.payrollCategory === 'INTERN');
          if (this.tab === 'receipts') this.loadReceipts();
        },
        error: (e) => (this.error = e?.error?.message || 'Unable to load interns. Please refresh.'),
      });
  }
  loadReceiptAccess(): void {
    this.canViewReceipts = false;
    if (!this.auth.hasModule('PAYROLL')) return;
    if (this.auth.isMasterUser()) { this.canViewReceipts = true; return; }
    this.payrollSettings.get().pipe(takeUntil(this.destroy$)).subscribe({
      next: settings => { this.canViewReceipts = !!settings?.allowBranchPayrollAccess; },
      error: () => { this.canViewReceipts = false; },
    });
  }
  openReceipts(): void {
    if (!this.canViewReceipts) return;
    this.tab = 'receipts';
    this.loadReceipts();
  }
  loadReceipts(): void {
    if (!this.canViewReceipts) return;
    const generation = ++this.receiptGeneration;
    const [year, month] = this.month.split('-').map(Number);
    this.receipts = [];
    this.error = '';
    if (!year || !month || month > 12) {
      this.error = 'Choose a valid stipend month.';
      return;
    }
    this.receiptLoading = true;
    this.payroll
      .listEmployeeRecords({ periodYear: year, periodMonth: month, payrollCategory: 'INTERN', ...(this.branchId ? { branchId: this.branchId } : {}) })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (generation === this.receiptGeneration) this.receiptLoading = false;
        }),
      )
      .subscribe({
        next: (result) => {
          if (generation !== this.receiptGeneration) return;
          this.receipts = result.records.filter((r) => r.payrollCategory === 'INTERN' && (!this.branchId || r.branchId === this.branchId));
        },
        error: (e) => {
          if (generation === this.receiptGeneration)
            this.error =
              e?.error?.message || 'Unable to load receipts. Branch payroll access is required.';
        },
      });
  }
  openDocuments(intern: Employee): void {
    this.tab = 'documents';
    this.documentInternId = intern.id;
    this.loadDocuments();
  }
  chooseFile(event: Event): void {
    this.documentSuccess = '';
    this.error = '';
    this.file = (event.target as HTMLInputElement).files?.[0] || null;
    if (this.file && this.file.size > 10 * 1024 * 1024) {
      this.error = 'Choose a file no larger than 10 MB.';
      this.file = null;
    }
  }
  loadDocuments(): void {
    const generation = ++this.documentGeneration;
    this.documents = [];
    this.file = null;
    this.documentName = '';
    this.documentSuccess = '';
    this.error = '';
    if (!this.documentInternId) {
      this.documentsLoading = false;
      return;
    }
    this.documentsLoading = true;
    this.http
      .get<any[]>(
        environment.apiBaseUrl +
          '/api/v1/employees/documents/' +
          encodeURIComponent(this.documentInternId),
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (generation === this.documentGeneration) this.documentsLoading = false;
        }),
      )
      .subscribe({
        next: (rows) => {
          if (generation === this.documentGeneration) this.documents = rows;
        },
        error: (e) => {
          if (generation === this.documentGeneration)
            this.error = e?.error?.message || 'Unable to load intern documents.';
        },
      });
  }
  uploadDocument(input: HTMLInputElement): void {
    if (!this.file || !this.documentInternId || this.uploading) return;
    const internId = this.documentInternId;
    const body = new FormData();
    body.append('file', this.file);
    body.append('docType', this.documentType);
    body.append('docName', this.documentName.trim() || this.file.name);
    this.uploading = true;
    this.error = '';
    this.documentSuccess = '';
    this.http
      .post(
        environment.apiBaseUrl +
          '/api/v1/employees/documents/' +
          encodeURIComponent(internId) +
          '/upload',
        body,
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.uploading = false)),
      )
      .subscribe({
        next: () => {
          input.value = '';
          if (internId === this.documentInternId) {
            this.loadDocuments();
            this.documentSuccess = 'Document uploaded.';
          }
        },
        error: (e) =>
          (this.error = e?.error?.message || 'Unable to upload the document. Please retry.'),
      });
  }
  downloadDocument(doc: { id: string; docName: string }): void {
    this.download(
      '/api/v1/employees/documents/download/' + encodeURIComponent(doc.id),
      doc.docName,
    );
  }
  agreement(intern: Employee): void {
    this.download(
      '/api/v1/client/employees/' + encodeURIComponent(intern.id) + '/intern-agreement',
      'Internship_Agreement_' + intern.employeeCode + '.pdf',
    );
  }
  receipt(record: EmployeePayrollRecord): void {
    if (!this.canViewReceipts || record.payrollCategory !== 'INTERN' || !record.runId || !record.payslipAvailable) return;
    this.download(
      '/api/v1/client/payroll/stipend-receipt?runId=' +
        encodeURIComponent(record.runId) +
        '&employeeCode=' +
        encodeURIComponent(record.employeeCode),
      'Stipend_Receipt_' + record.employeeCode + '_' + this.month + '.pdf',
    );
  }
  private download(path: string, name: string): void {
    if (this.downloading) return;
    this.downloading = name;
    this.error = '';
    this.http
      .get(environment.apiBaseUrl + path, { responseType: 'blob' })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.downloading = '')),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: () =>
          (this.error =
            'Unable to download. Check enrollment details and document availability, then retry.'),
      });
  }
}
