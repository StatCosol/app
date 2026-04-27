import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { ComplianceService } from '../../../core/compliance.service';
import { AuditsService } from '../../../core/audits.service';
import { ContractorProfileApiService } from '../../../core/contractor-profile-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type RowType = 'TASK' | 'REUPLOAD' | 'AUDIT';

interface UnifiedWorkRow {
  id: string;
  rowType: RowType;
  title: string;
  status: string;
  dueDate: string | null;
  branchName: string;
  clientName: string;
  reason?: string;
  remarks?: string;
  documentId?: number;
  createdAt?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  evidenceCount?: number;
  // Audit-specific
  score?: number | null;
  auditorName?: string;
  periodCode?: string;
  frequency?: string;
  finalRemark?: string;
  scheduledDate?: string | null;
  branchId?: string | null;
}

interface TimelineEvent {
  type: 'COMMENT' | 'EVIDENCE' | 'REUPLOAD' | 'STATUS';
  title: string;
  description: string;
  at: string;
  status?: string;
}

interface AuditNonComplianceRow {
  id: string;
  auditId: string;
  documentName: string;
  remark: string;
  status: string;
  raisedAt: string | null;
  auditCode: string;
  auditType: string;
  branchName: string;
}

interface AuditDocTemplate {
  label: string;
  docType: string;
  titleHint: string;
  helpText: string;
  section?: string;
  /** Minimum audit frequency for this doc to be required. If absent → always shown. */
  minFrequency?: 'MONTHLY' | 'BI_MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'EVENT';
}

interface ChecklistItem {
  id: string;
  docType: string;
  branchId: string | null;
  isRequired: boolean;
  uploaded: boolean;
  uploadedDocs: { id: string; fileName: string; status: string; uploadedAt: string; branchId: string | null }[];
}

interface MonthlyChecklist {
  month: string;
  items: ChecklistItem[];
}

@Component({
  standalone: true,
  selector: 'app-contractor-tasks',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './contractor-tasks.component.html',
  styleUrls: ['../shared/contractor-theme.scss', './contractor-tasks.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorTasksComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  allRows: UnifiedWorkRow[] = [];
  filteredRows: UnifiedWorkRow[] = [];
  selectedRow: UnifiedWorkRow | null = null;

  selectedTaskDetail: any = null;
  selectedTaskHistory: TimelineEvent[] = [];
  relatedReuploads: UnifiedWorkRow[] = [];
  auditNonCompliances: AuditNonComplianceRow[] = [];

  loading = false;
  detailLoading = false;
  actionBusy = false;

  search = '';
  typeFilter: 'ALL' | RowType = 'ALL';
  freqFilter = 'ALL';
  statusFilter = 'ALL';
  branchFilter = '';
  dueFilter: 'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_7_DAYS' = 'ALL';

  availableBranches: { id: string; name: string }[] = [];

  readonly statusOptions = [
    'ALL',
    'OPEN',
    'PENDING',
    'IN_PROGRESS',
    'SUBMITTED',
    'REJECTED',
    'OVERDUE',
    'APPROVED',
    'REVERIFIED',
    'CLOSED',
    'PLANNED',
    'COMPLETED',
    'CORRECTION_PENDING',
    'REVERIFICATION_PENDING',
  ];

  taskUploadFile: File | null = null;
  taskUploadNote = '';
  taskReply = '';
  reuploadFile: File | null = null;
  auditNcFiles: Record<string, File | null> = {};

  // Monthly document checklist
  monthlyChecklist: MonthlyChecklist | null = null;
  checklistLoading = false;
  checklistUploadItem: ChecklistItem | null = null;
  checklistUploadFile: File | null = null;
  checklistUploadTitle = '';
  checklistUploadBranchId = '';
  checklistUploading = false;

  // Checklist selectors (branch / month / year)
  checklistBranchId = '';
  checklistMonth: number = new Date().getMonth() + 1;   // 1-12
  checklistYear: number = new Date().getFullYear();

  readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  get availableYears(): number[] {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }

  get checklistMonthParam(): string {
    return `${this.checklistYear}-${String(this.checklistMonth).padStart(2, '0')}`;
  }

  /** MCD deadline: 20th of the month following the selected month/year */
  get checklistDeadline(): Date {
    let year = this.checklistYear;
    let month = this.checklistMonth; // 1-12
    if (month === 12) { month = 1; year += 1; } else { month += 1; }
    return new Date(year, month - 1, 20);   // month-1 because Date() uses 0-indexed months
  }

  /** Days until (positive) or past (negative) the MCD deadline */
  get checklistDeadlineDaysLeft(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dl = new Date(this.checklistDeadline);
    dl.setHours(0, 0, 0, 0);
    return Math.ceil((dl.getTime() - today.getTime()) / 86400000);
  }

  get checklistDeadlineTone(): 'overdue' | 'urgent' | 'warning' | 'ok' {
    const d = this.checklistDeadlineDaysLeft;
    if (d < 0) return 'overdue';
    if (d <= 3) return 'urgent';
    if (d <= 7) return 'warning';
    return 'ok';
  }

  get checklistDeadlineLabel(): string {
    const d = this.checklistDeadlineDaysLeft;
    const fmt = this.checklistDeadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    if (d < 0) return `Overdue by ${Math.abs(d)} day(s) — deadline was ${fmt}`;
    if (d === 0) return `Due today — ${fmt}`;
    if (d === 1) return `1 day left — due ${fmt}`;
    return `${d} days left — due ${fmt}`;
  }

  // Audit primary document upload
  auditDocFile: File | null = null;
  auditDocType = '';
  auditDocTitle = '';
  auditDocUploading = false;
  auditDocActiveSection = '';

  // Already-uploaded docs for the selected audit
  auditUploadedDocs: { id: string; docType: string; title: string; status: string; uploadedAt: string }[] = [];
  auditUploadedDocsLoading = false;

  // Upload lock for the selected audit
  auditUploadLockFrom: string | null = null;
  auditUploadLockUntil: string | null = null;

  get isAuditUploadLocked(): boolean {
    if (!this.auditUploadLockFrom || !this.auditUploadLockUntil) return false;
    const today = new Date().toISOString().slice(0, 10);
    return today >= this.auditUploadLockFrom && today <= this.auditUploadLockUntil;
  }

  private static readonly MONTHLY_DOC_META: Record<string, { label: string; desc: string }> = {
    WAGE_REGISTER:  { label: 'Wage Register',            desc: 'Monthly wage sheet for all contract workers' },
    MUSTER_ROLL:    { label: 'Muster Roll',              desc: 'Attendance register (Form XVI) for the month' },
    OT_REGISTER:    { label: 'Overtime (OT) Register',   desc: 'Record of overtime hours worked by contract employees' },
    PF_CHALLAN:     { label: 'PF Challan',               desc: 'Provident Fund payment challan / ECR receipt' },
    ESI_CHALLAN:    { label: 'ESI Challan',              desc: 'ESI contribution payment receipt for the month' },
    PT_CHALLAN:     { label: 'Professional Tax (PT)',    desc: 'Professional Tax challan / payment proof' },
  };

  readonly auditDocTemplates: AuditDocTemplate[] = [
    // Section I – License Details (always required)
    {
      section: 'I. License Details',
      label: 'CLRA License',
      docType: 'CLRA_LICENSE',
      titleHint: 'CLRA License – Validity & Workcentre Address',
      helpText: 'Valid CLRA license showing validity period and workcentre address.',
    },
    // Section II – Agreement (always required)
    {
      section: 'II. Agreement',
      label: 'Work Order / Contract Agreement',
      docType: 'WORK_ORDER',
      titleHint: 'Work Order / Contract Agreement',
      helpText: 'Signed agreement between contractor and principal employer.',
    },
    // Section III – Registers
    {
      section: 'III. Registers',
      label: 'Register of Muster Roll',
      docType: 'MUSTER_ROLL_REGISTER',
      titleHint: 'Register of Muster Roll',
      helpText: 'Attendance muster roll maintained for all contract employees.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Register of Wages',
      docType: 'WAGE_REGISTER',
      titleHint: 'Register of Wages',
      helpText: 'Monthly wage register for all contract employees.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Register of Fines',
      docType: 'REGISTER_OF_FINES',
      titleHint: 'Register of Fines',
      helpText: 'Register recording all fines imposed on contract workers.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Register of Deductions for Damage',
      docType: 'REGISTER_OF_DEDUCTIONS',
      titleHint: 'Register of Deductions for Damage or Loss',
      helpText: 'Register of deductions made for damage or loss caused by workers.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Register of Advances',
      docType: 'REGISTER_OF_ADVANCES',
      titleHint: 'Register of Advances',
      helpText: 'Register of salary / wage advances given to contract workers.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Register of Overtime',
      docType: 'OT_REGISTER',
      titleHint: 'Register of Overtime',
      helpText: 'Register recording overtime hours and payments for contract employees.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Register of Employment (Form-13)',
      docType: 'EMPLOYMENT_REGISTER_F13',
      titleHint: 'Register of Employment – Form 13',
      helpText: 'Form 13 register listing all employed contract workers.',
    },
    {
      section: 'III. Registers',
      label: 'Half Yearly Returns (Form XIV)',
      docType: 'HALF_YEARLY_RETURNS_F14',
      titleHint: 'Half Yearly Returns – Form XIV under CLRA',
      helpText: 'Half-yearly returns submitted under the Contract Labour (R&A) Act.',
      minFrequency: 'HALF_YEARLY',
    },
    {
      section: 'III. Registers',
      label: 'Wages Slips',
      docType: 'WAGE_SLIPS',
      titleHint: 'Wages Slips for Contract Employees',
      helpText: 'Individual pay slips issued to each contract employee.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Employment Cards',
      docType: 'EMPLOYMENT_CARDS',
      titleHint: 'Employment Cards',
      helpText: 'Employment cards issued to each contract worker.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'III. Registers',
      label: 'Form 6A – Commencement of Contract Work',
      docType: 'FORM_6A',
      titleHint: 'Form 6A – Commencement / Completion of Contract Work',
      helpText: 'Notice of commencement/completion of contract work filed with the authority.',
      minFrequency: 'EVENT',
    },
    // Section IV – Minimum Wages
    {
      section: 'IV. Minimum Wages',
      label: 'Minimum Wages Returns',
      docType: 'MINIMUM_WAGES_RETURNS',
      titleHint: 'Annual Returns – Payment of Minimum Wages',
      helpText: 'Annual returns under the Minimum Wages Act confirming statutory wages are paid.',
      minFrequency: 'YEARLY',
    },
    // Section V – Weekly Off
    {
      section: 'V. Weekly Off',
      label: 'Weekly Off Record',
      docType: 'WEEKLY_OFF_RECORD',
      titleHint: 'Weekly Off Roster / Record',
      helpText: 'Record showing that weekly off is being given to all contract employees.',
      minFrequency: 'MONTHLY',
    },
    // Section VI – Provident Fund
    {
      section: 'VI. Provident Fund (PF)',
      label: 'PF Allotment Code',
      docType: 'PF_ALLOTMENT_CODE',
      titleHint: 'PF Allotment Code Number',
      helpText: 'PF code allotment letter / establishment registration under EPFO.',
      minFrequency: 'YEARLY',
    },
    {
      section: 'VI. Provident Fund (PF)',
      label: 'PF Challans (Monthly)',
      docType: 'PF_CHALLAN',
      titleHint: 'PF Challans – Month Wise',
      helpText: 'Monthly Provident Fund payment challans deposited with EPFO.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'VI. Provident Fund (PF)',
      label: 'PF Individual Numbers (Location Wise)',
      docType: 'PF_INDIVIDUAL_NUMBERS',
      titleHint: 'PF Individual Numbers – Location Wise',
      helpText: 'List of PF account numbers assigned to each contract employee.',
      minFrequency: 'QUARTERLY',
    },
    {
      section: 'VI. Provident Fund (PF)',
      label: 'PF ECR, Payment Receipt & Acknowledgement',
      docType: 'PF_ECR',
      titleHint: 'PF ECR / Payment Receipt / Acknowledgement Copy – Month Wise',
      helpText: 'Electronic Challan cum Return (ECR), payment proof, and EPFO acknowledgement.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'VI. Provident Fund (PF)',
      label: 'PF Nomination & Declaration Forms',
      docType: 'PF_NOMINATION',
      titleHint: 'PF Nomination & Declaration Forms',
      helpText: 'Nomination forms (Form 2) and declaration forms for all contract employees.',
      minFrequency: 'YEARLY',
    },
    // Section VII – ESI
    {
      section: 'VII. ESI',
      label: 'ESI Code / Sub Code No.',
      docType: 'ESI_CODE',
      titleHint: 'ESI Code / Sub Code Allotment Letter',
      helpText: 'ESIC code or sub-code allotment letter for the contractor.',
      minFrequency: 'YEARLY',
    },
    {
      section: 'VII. ESI',
      label: 'ESI No. & Card for Employees',
      docType: 'ESI_EMPLOYEE_CARDS',
      titleHint: 'ESI Insurance Numbers & Cards',
      helpText: 'ESI insurance numbers and cards issued to all eligible contract workers.',
      minFrequency: 'QUARTERLY',
    },
    {
      section: 'VII. ESI',
      label: 'ESIC Challans (Month Wise)',
      docType: 'ESI_CHALLAN',
      titleHint: 'ESIC Challans – Month Wise',
      helpText: 'Monthly ESIC contribution challans deposited with ESIC.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'VII. ESI',
      label: 'Form 7 – Register of Employees',
      docType: 'ESI_FORM7',
      titleHint: 'ESIC Form 7 – Register of Employees',
      helpText: 'Form 7 register of insured contract employees maintained under ESIC.',
      minFrequency: 'QUARTERLY',
    },
    {
      section: 'VII. ESI',
      label: 'Register of Accidents',
      docType: 'ACCIDENT_REGISTER',
      titleHint: 'Register of Accidents',
      helpText: 'Register recording workplace accidents involving contract employees.',
      minFrequency: 'QUARTERLY',
    },
    {
      section: 'VII. ESI',
      label: 'ESI Permanent / Temporary Cards',
      docType: 'ESI_CARDS_SIGNED',
      titleHint: 'ESI Permanent/Temporary Cards – Signed by Employee & Employer',
      helpText: 'ESI cards duly signed by both employee and employer.',
      minFrequency: 'QUARTERLY',
    },
    // Section VIII – Bonus
    {
      section: 'VIII. Payment of Bonus',
      label: 'Register of Form C (Bonus)',
      docType: 'BONUS_FORM_C',
      titleHint: 'Register of Form C – Payment of Bonus',
      helpText: 'Form C register showing bonus paid to each eligible contract employee.',
      minFrequency: 'YEARLY',
    },
    {
      section: 'VIII. Payment of Bonus',
      label: 'Form D – Annual Returns (Bonus)',
      docType: 'BONUS_FORM_D',
      titleHint: 'Form D – Annual Returns under Payment of Bonus Act',
      helpText: 'Annual returns filed under the Payment of Bonus Act.',
      minFrequency: 'YEARLY',
    },
    // Section IX – Separation Docs
    {
      section: 'IX. Separation Docs',
      label: 'Service Certificates',
      docType: 'SERVICE_CERTIFICATE',
      titleHint: 'Service Certificates for Separated Employees',
      helpText: 'Service certificates issued to contract employees who have left during the period.',
      minFrequency: 'MONTHLY',
    },
    {
      section: 'IX. Separation Docs',
      label: 'Full & Final Settlement',
      docType: 'FULL_FINAL_SETTLEMENT',
      titleHint: 'Full & Final Settlement Records',
      helpText: 'Full and final settlement statements for contract employees who have separated.',
      minFrequency: 'MONTHLY',
    },
  ];

  private static readonly FREQ_RANK: Record<string, number> = {
    MONTHLY: 1,
    BI_MONTHLY: 2,
    QUARTERLY: 3,
    HALF_YEARLY: 4,
    YEARLY: 5,
  };

  /** Docs visible for the currently selected audit's frequency. */
  get visibleAuditDocTemplates(): AuditDocTemplate[] {
    const freq = this.selectedRow?.frequency;
    if (!freq) return this.auditDocTemplates;

    if (freq === 'EVENT') {
      // Event audits: always-shown docs (no minFrequency) + EVENT-specific
      return this.auditDocTemplates.filter(
        (t) => !t.minFrequency || t.minFrequency === 'EVENT',
      );
    }

    const rank = ContractorTasksComponent.FREQ_RANK[freq] ?? 5;
    return this.auditDocTemplates.filter((t) => {
      if (!t.minFrequency) return true;          // always shown
      if (t.minFrequency === 'EVENT') return false; // event-only, not in periodic audits
      return (ContractorTasksComponent.FREQ_RANK[t.minFrequency] ?? 1) <= rank;
    });
  }

  get visibleAuditDocSections(): string[] {
    const seen = new Set<string>();
    const sections: string[] = [];
    for (const t of this.visibleAuditDocTemplates) {
      const s = t.section ?? '';
      if (!seen.has(s)) { seen.add(s); sections.push(s); }
    }
    return sections;
  }

  visibleAuditDocTemplatesBySection(section: string): AuditDocTemplate[] {
    return this.visibleAuditDocTemplates.filter((t) => (t.section ?? '') === section);
  }

  get auditDocSections(): string[] {
    const seen = new Set<string>();
    const sections: string[] = [];
    for (const t of this.auditDocTemplates) {
      const s = t.section ?? '';
      if (!seen.has(s)) { seen.add(s); sections.push(s); }
    }
    return sections;
  }

  auditDocTemplatesBySection(section: string): AuditDocTemplate[] {
    return this.auditDocTemplates.filter((t) => (t.section ?? '') === section);
  }

  /** True if a docType has been uploaded (any status) for the current audit */
  auditDocIsUploaded(docType: string): boolean {
    return this.auditUploadedDocs.some((d) => d.docType === docType);
  }

  /** Returns the latest status for a given docType ('PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | null) */
  auditDocStatus(docType: string): string | null {
    const docs = this.auditUploadedDocs.filter((d) => d.docType === docType);
    if (!docs.length) return null;
    // Priority: REJECTED > PENDING_REVIEW > APPROVED (show worst state)
    if (docs.some((d) => d.status === 'REJECTED')) return 'REJECTED';
    if (docs.some((d) => d.status === 'PENDING_REVIEW')) return 'PENDING_REVIEW';
    return 'APPROVED';
  }

  /** Returns all rejected uploaded docs for the current audit */
  get auditRejectedDocs(): { id: string; docType: string; title: string; uploadedAt: string }[] {
    return this.auditUploadedDocs.filter((d) => d.status === 'REJECTED');
  }

  /** Progress for the current audit: { uploaded, total, rejected } based on visible required templates */
  get auditDocProgress(): { uploaded: number; total: number; rejected: number } {
    const total = this.visibleAuditDocTemplates.length;
    const uploaded = this.visibleAuditDocTemplates.filter((t) =>
      this.auditDocIsUploaded(t.docType),
    ).length;
    const rejected = this.visibleAuditDocTemplates.filter((t) =>
      this.auditDocStatus(t.docType) === 'REJECTED',
    ).length;
    return { uploaded, total, rejected };
  }

  /** Human-readable label for a Frequency enum value. */
  frequencyLabel(freq: string | undefined | null): string {
    if (!freq) return '-';
    const map: Record<string, string> = {
      MONTHLY: 'Monthly',
      BI_MONTHLY: 'Bi-Monthly',
      QUARTERLY: 'Quarterly',
      HALF_YEARLY: 'Half-Yearly',
      YEARLY: 'Annual',
      EVENT: 'Event-Based',
    };
    return map[freq] ?? freq;
  }

  private pendingTaskIdFromRoute: string | null = null;

  constructor(
    private api: ComplianceService,
    private auditsApi: AuditsService,
    private contractorProfileApi: ContractorProfileApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyRouteDefaults();
      this.applyFilters();
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.pendingTaskIdFromRoute = params.get('id');
      if (this.pendingTaskIdFromRoute && this.filteredRows.length) {
        this.selectFromRouteId(this.pendingTaskIdFromRoute);
      }
    });

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.loadChecklist();

    forkJoin({
      tasks: this.api.getContractorTasks({}),
      reuploads: this.api.contractorGetReuploadRequests({}),
      audits: this.auditsApi.contractorListAudits({}),
      profile: this.contractorProfileApi.getContractorBranches(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ tasks, reuploads, audits, profile }) => {
          const taskRows = this.toArray(tasks).map((t: any) =>
            this.mapTaskRow(t),
          );
          const reuploadRows = this.toArray(reuploads).map((r: any) =>
            this.mapReuploadRow(r),
          );
          const auditRows = this.toArray(audits).map((a: any) =>
            this.mapAuditRow(a),
          );

          this.availableBranches = (profile?.branches || []).map((b: any) => ({
            id: b.id,
            name: b.name || b.branchName || '',
          })).filter((b: any) => b.name);

          // Auto-select first branch for checklist if none chosen yet
          if (!this.checklistBranchId && this.availableBranches.length === 1) {
            this.checklistBranchId = this.availableBranches[0].id;
          }

          this.allRows = [...taskRows, ...reuploadRows, ...auditRows].sort(
            (a, b) => this.dateValue(a.dueDate) - this.dateValue(b.dueDate),
          );
          this.applyFilters();
          this.tryRestoreSelection();
        },
        error: (err: any) => {
          this.allRows = [];
          this.filteredRows = [];
          this.selectedRow = null;
          this.toast.error(
            'Load failed',
            err?.error?.message || 'Could not load contractor task center.',
          );
        },
      });
  }

  applyFilters(): void {
    const term = this.search.trim().toLowerCase();

    this.filteredRows = this.allRows.filter((row) => {
      if (this.typeFilter !== 'ALL' && row.rowType !== this.typeFilter) {
        return false;
      }

      if (this.freqFilter !== 'ALL' && row.rowType === 'AUDIT') {
        if ((row.frequency ?? '') !== this.freqFilter) return false;
      }
      // My Workboard shows only TASK and REUPLOAD — audits are on the dedicated Audits page
      if (this.typeFilter === 'ALL' && row.rowType === 'AUDIT') {
        return false;
      }

      if (this.statusFilter !== 'ALL') {
        if (this.statusFilter === 'OPEN') {
          if (!this.isOpenStatus(row.status)) return false;
        } else if (row.status !== this.statusFilter) {
          return false;
        }
      }

      if (this.branchFilter) {
        // Match by branchName directly, or look up by branchId if branchName not set
        const rowBranch = row.branchName && row.branchName !== '-'
          ? row.branchName
          : this.availableBranches.find((b) => b.id === row.branchId)?.name || '-';

        // Client-level audits have no branchId — show them under every branch the contractor belongs to
        const isUnlinkedAudit = row.rowType === 'AUDIT' && !row.branchId && rowBranch === '-';

        if (!isUnlinkedAudit && rowBranch !== this.branchFilter) {
          return false;
        }
      }

      if (!this.matchDueFilter(row)) {
        return false;
      }

      if (!term) return true;
      const haystack = [
        row.title,
        row.branchName,
        row.clientName,
        row.reason || '',
        row.remarks || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    if (
      this.selectedRow &&
      !this.filteredRows.some((r) => this.sameRow(r, this.selectedRow!))
    ) {
      this.selectedRow = null;
      this.selectedTaskDetail = null;
      this.selectedTaskHistory = [];
      this.relatedReuploads = [];
    }

    if (!this.selectedRow && this.filteredRows.length) {
      this.selectRow(this.filteredRows[0]);
    }
    this.cdr.markForCheck();
  }

  selectRow(row: UnifiedWorkRow): void {
    this.selectedRow = row;
    this.taskUploadFile = null;
    this.taskUploadNote = '';
    this.taskReply = '';
    this.reuploadFile = null;
    this.auditNcFiles = {};

    if (row.rowType === 'TASK') {
      this.auditNonCompliances = [];
      this.loadTaskDetail(row.id);
      return;
    }

    if (row.rowType === 'AUDIT') {
      this.selectedTaskDetail = null;
      this.relatedReuploads = [];
      this.selectedTaskHistory = [];
      this.auditDocActiveSection = '';
      this.auditDocType = '';
      this.auditDocTitle = '';
      this.auditDocFile = null;
      this.auditUploadedDocs = [];
      this.auditUploadLockFrom = null;
      this.auditUploadLockUntil = null;
      this.loadAuditNonCompliances(row.id);
      this.loadAuditUploadedDocs(row.id);
      this.loadAuditUploadLock(row.id);
      return;
    }

    this.selectedTaskDetail = null;
    this.relatedReuploads = [];
    this.auditNonCompliances = [];
    this.selectedTaskHistory = this.buildReuploadTimeline(row);
    this.cdr.markForCheck();
  }

  startSelectedTask(): void {
    if (!this.selectedRow || this.selectedRow.rowType !== 'TASK' || this.actionBusy) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorStart(this.selectedRow.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Task started', 'Task moved to in-progress.');
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Action failed',
            err?.error?.message || 'Unable to start task.',
          ),
      });
  }

  submitSelectedTask(): void {
    if (!this.selectedRow || this.selectedRow.rowType !== 'TASK' || this.actionBusy) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorSubmit(this.selectedRow.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Task submitted', 'Sent for CRM/Auditor review.');
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Submit failed',
            err?.error?.message || 'Unable to submit task.',
          ),
      });
  }

  uploadTaskEvidence(): void {
    if (
      !this.selectedRow ||
      this.selectedRow.rowType !== 'TASK' ||
      !this.taskUploadFile ||
      this.actionBusy
    ) {
      return;
    }
    this.actionBusy = true;
    this.api
      .uploadContractorTaskFile(
        this.selectedRow.id,
        this.taskUploadFile,
        this.taskUploadNote.trim() || undefined,
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('File uploaded', 'Evidence uploaded successfully.');
          this.taskUploadFile = null;
          this.taskUploadNote = '';
          this.loadTaskDetail(this.selectedRow!.id, true);
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Upload failed',
            err?.error?.message || 'Could not upload evidence.',
          ),
      });
  }

  sendTaskReply(): void {
    if (
      !this.selectedRow ||
      this.selectedRow.rowType !== 'TASK' ||
      !this.taskReply.trim() ||
      this.actionBusy
    ) {
      return;
    }
    this.actionBusy = true;
    this.api
      .respondToContractorTask(this.selectedRow.id, this.taskReply.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Reply posted', 'Comment added to task history.');
          this.taskReply = '';
          this.loadTaskDetail(this.selectedRow!.id, true);
        },
        error: (err: any) =>
          this.toast.error(
            'Reply failed',
            err?.error?.message || 'Could not post reply.',
          ),
      });
  }

  uploadReuploadFile(): void {
    if (
      !this.selectedRow ||
      this.selectedRow.rowType !== 'REUPLOAD' ||
      !this.reuploadFile ||
      this.actionBusy
    ) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorReuploadUpload(this.selectedRow.id, this.reuploadFile)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('File uploaded', 'Replacement file uploaded.');
          this.reuploadFile = null;
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Upload failed',
            err?.error?.message || 'Could not upload replacement file.',
          ),
      });
  }

  submitReupload(): void {
    if (!this.selectedRow || this.selectedRow.rowType !== 'REUPLOAD' || this.actionBusy) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorReuploadSubmit(this.selectedRow.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Submitted', 'Reupload sent for verification.');
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Submit failed',
            err?.error?.message || 'Could not submit reupload.',
          ),
      });
  }

  onTaskFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0] || null;
    this.taskUploadFile = file;
    this.cdr.markForCheck();
  }

  onReuploadFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0] || null;
    this.reuploadFile = file;
    this.cdr.markForCheck();
  }

  onAuditNcFileSelected(event: Event, ncId: string): void {
    const file = (event.target as HTMLInputElement)?.files?.[0] || null;
    this.auditNcFiles[ncId] = file;
    this.cdr.markForCheck();
  }

  uploadAuditNcFile(ncId: string): void {
    const file = this.auditNcFiles[ncId] || null;
    if (!this.selectedRow || this.selectedRow.rowType !== 'AUDIT' || !file || this.actionBusy) {
      return;
    }

    this.actionBusy = true;
    this.auditsApi
      .contractorUploadCorrectedFile(ncId, file)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('File uploaded', 'Corrected audit document uploaded.');
          delete this.auditNcFiles[ncId];
          this.loadAuditNonCompliances(this.selectedRow!.id, true);
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Upload failed',
            err?.error?.message || 'Could not upload corrected audit document.',
          ),
      });
  }

  onAuditDocFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0] || null;
    this.auditDocFile = file;
    if (file && !this.auditDocTitle) {
      this.auditDocTitle = file.name.replace(/\.[^.]+$/, '');
    }
    this.cdr.markForCheck();
  }

  useAuditDocTemplate(template: AuditDocTemplate): void {
    this.auditDocType = template.docType;
    if (!this.auditDocTitle.trim()) {
      this.auditDocTitle = template.titleHint;
    }
    this.cdr.markForCheck();
  }

  uploadAuditDocument(): void {
    const row = this.selectedRow;
    if (!row || row.rowType !== 'AUDIT' || this.auditDocUploading) return;
    if (!this.auditDocFile) {
      this.toast.error('Select a file to upload');
      return;
    }
    if (!this.auditDocType.trim()) {
      this.toast.error('Document type is required');
      return;
    }
    if (!this.auditDocTitle.trim()) {
      this.toast.error('Document title is required');
      return;
    }
    // Resolve branchId: prefer the one on the audit row; fall back to the
    // contractor's only branch (audits scheduled at client level have no branch).
    const resolvedBranchId: string | null =
      row.branchId ||
      (this.availableBranches.length === 1 ? this.availableBranches[0].id : null);

    if (!resolvedBranchId) {
      this.toast.error('Cannot determine branch — please contact admin to link this audit to a branch');
      return;
    }

    this.auditDocUploading = true;
    this.cdr.markForCheck();
    this.contractorProfileApi.uploadAuditDocument({
      auditId: row.id,
      branchId: resolvedBranchId,
      docType: this.auditDocType.trim(),
      title: this.auditDocTitle.trim(),
      file: this.auditDocFile,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.auditDocUploading = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        this.toast.success('Document uploaded', 'Audit document uploaded for review.');
        this.auditDocFile = null;
        this.auditDocType = '';
        this.auditDocTitle = '';
        if (this.selectedRow?.rowType === 'AUDIT') {
          this.loadAuditUploadedDocs(this.selectedRow.id);
        }
        this.cdr.markForCheck();
      },
      error: (err: any) =>
        this.toast.error(
          'Upload failed',
          err?.error?.message || 'Could not upload audit document.',
        ),
    });
  }

  rowTypeLabel(type: string): string {
    const map: Record<string, string> = {
      ALL: 'All Work',
      TASK: 'Compliance Task',
      AUDIT: 'Audit',
      REUPLOAD: 'Re-upload',
    };
    return map[type] ?? type;
  }

  statusLabel(status: string): string {
    if (status === 'ALL') return 'All Stages';
    return status
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  nextStepHint(row: UnifiedWorkRow): string {
    if (row.rowType === 'TASK') {
      if (row.status === 'PENDING' || row.status === 'OPEN') return 'Click to start';
      if (row.status === 'IN_PROGRESS') return 'Upload evidence & submit';
      if (row.status === 'SUBMITTED') return 'Awaiting review';
      if (row.status === 'REJECTED' || row.status === 'CORRECTION_PENDING') return 'Correction needed';
    }
    if (row.rowType === 'REUPLOAD') {
      if (row.status === 'OPEN' || row.status === 'PENDING') return 'Upload replacement file';
      if (row.status === 'SUBMITTED') return 'Awaiting verification';
    }
    if (row.rowType === 'AUDIT') {
      if (row.status === 'PLANNED') return 'Upload your compliance docs';
      if (row.status === 'IN_PROGRESS') return 'Audit in progress';
      if (row.status === 'COMPLETED') return 'Audit completed';
    }
    return '';
  }

  dueText(row: UnifiedWorkRow): string {
    if (!row.dueDate) return 'No due date';
    const due = new Date(row.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `Overdue by ${Math.abs(diff)} day(s)`;
    if (diff === 0) return 'Due today';
    return `Due in ${diff} day(s)`;
  }

  get uniqueBranches(): string[] {
    // Merge API-loaded branches with any branch names found in rows
    const fromApi = this.availableBranches.map((b) => b.name).filter(Boolean);
    const fromRows = this.allRows
      .map((r) => r.branchName)
      .filter((b) => b && b !== '-');
    const merged = new Set([...fromApi, ...fromRows]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }

  get summaryCards(): Array<{ label: string; value: number; tone: string }> {
    const scopedRows = this.typeFilter === 'AUDIT'
      ? this.allRows.filter((r) => r.rowType === 'AUDIT')
      : this.allRows.filter((r) => r.rowType !== 'AUDIT');
    const openCount = scopedRows.filter((r) => this.isOpenStatus(r.status)).length;
    const overdueCount = scopedRows.filter((r) =>
      this.isOverdueStatus(r.status, r.dueDate),
    ).length;
    const reuploadOpen = scopedRows.filter(
      (r) => r.rowType === 'REUPLOAD' && this.isOpenStatus(r.status),
    ).length;
    const submitted = scopedRows.filter((r) => r.status === 'SUBMITTED').length;

    return [
      { label: 'Total items', value: scopedRows.length, tone: 'neutral' },
      { label: 'Open items', value: openCount, tone: 'info' },
      { label: 'Overdue', value: overdueCount, tone: 'danger' },
      { label: 'Open reuploads', value: reuploadOpen, tone: 'warning' },
      { label: 'Submitted', value: submitted, tone: 'success' },
    ];
  }

  private loadTaskDetail(taskId: string, silent = false): void {
    this.detailLoading = !silent;
    forkJoin({
      detail: this.api.getContractorTaskById(taskId),
      history: this.api.getContractorTaskHistory(taskId),
      reuploads: this.api.contractorGetReuploadRequests({}),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ detail, history, reuploads }) => {
          this.selectedTaskDetail = detail?.task || null;

          const taskEvidence = Array.isArray(detail?.evidence) ? detail.evidence : [];
          const evidenceIds = new Set(
            taskEvidence
              .map((e: any) => Number(e?.id))
              .filter((id: number) => Number.isFinite(id)),
          );
          const reqRows = this.toArray(reuploads).map((r: any) =>
            this.mapReuploadRow(r),
          );
          this.relatedReuploads = reqRows.filter(
            (r) => evidenceIds.size > 0 && evidenceIds.has(Number(r.documentId)),
          );

          const baseEvents = Array.isArray(history?.events) ? history.events : [];
          const reuploadEvents = this.relatedReuploads
            .filter((r) => !!r.createdAt)
            .map((r) => ({
              type: 'REUPLOAD' as const,
              title: `Reupload request #${r.id.slice(0, 8)}`,
              description: r.reason || r.remarks || 'Reupload requested',
              at: String(r.createdAt),
              status: r.status,
            }));

          this.selectedTaskHistory = [...baseEvents, ...reuploadEvents]
            .filter((e: any) => !!e?.at)
            .sort(
              (a: any, b: any) =>
                new Date(b.at).getTime() - new Date(a.at).getTime(),
            );
        },
        error: (err: any) => {
          this.selectedTaskDetail = null;
          this.relatedReuploads = [];
          this.selectedTaskHistory = [];
          this.toast.error(
            'Detail failed',
            err?.error?.message || 'Could not load selected task.',
          );
        },
      });
  }

  private loadAuditNonCompliances(auditId: string, silent = false): void {
    this.detailLoading = !silent;
    this.auditsApi
      .contractorListNonCompliances()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          const allRows = this.toArray(rows).map((row: any) =>
            this.mapAuditNcRow(row),
          );
          this.auditNonCompliances = allRows.filter(
            (row: AuditNonComplianceRow) => row.auditId === auditId,
          );
        },
        error: (err: any) => {
          this.auditNonCompliances = [];
          this.toast.error(
            'Detail failed',
            err?.error?.message || 'Could not load audit non-compliances.',
          );
        },
      });
  }

  private loadAuditUploadedDocs(auditId: string): void {
    this.auditUploadedDocsLoading = true;
    this.cdr.markForCheck();
    this.contractorProfileApi
      .getContractorDocuments({ auditId })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.auditUploadedDocsLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          const rows = this.toArray(res?.data ?? res);
          this.auditUploadedDocs = rows.map((d: any) => ({
            id: d.id,
            docType: d.docType ?? d.doc_type ?? '',
            title: d.title ?? '',
            status: d.status ?? 'PENDING_REVIEW',
            uploadedAt: d.createdAt ?? d.created_at ?? '',
          }));
        },
        error: () => {
          this.auditUploadedDocs = [];
        },
      });
  }

  private loadAuditUploadLock(auditId: string): void {
    this.auditsApi.contractorGetUploadLock(auditId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.auditUploadLockFrom = res?.lockFrom ?? res?.uploadLockFrom ?? null;
        this.auditUploadLockUntil = res?.lockUntil ?? res?.uploadLockUntil ?? null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.auditUploadLockFrom = null;
        this.auditUploadLockUntil = null;
      },
    });
  }

  private buildReuploadTimeline(row: UnifiedWorkRow): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    if (row.createdAt) {
      events.push({
        type: 'REUPLOAD',
        title: 'Request created',
        description: row.reason || 'Reupload request created',
        at: row.createdAt,
        status: 'OPEN',
      });
    }
    if (row.submittedAt) {
      events.push({
        type: 'STATUS',
        title: 'Submitted by contractor',
        description: 'Replacement file submitted for review.',
        at: row.submittedAt,
        status: 'SUBMITTED',
      });
    }
    if (row.updatedAt) {
      events.push({
        type: 'STATUS',
        title: `Status: ${row.status}`,
        description: row.remarks || 'Request status changed',
        at: row.updatedAt,
        status: row.status,
      });
    }
    return events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }

  reloadChecklist(): void {
    // Reset upload form when context changes
    this.checklistUploadItem = null;
    this.checklistUploadFile = null;
    this.loadChecklist();
  }

  private loadChecklist(): void {
    this.checklistLoading = true;
    this.contractorProfileApi
      .getMonthlyDocChecklist(this.checklistMonthParam, this.checklistBranchId || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.checklistLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (data) => {
          this.monthlyChecklist = data;
        },
        error: () => {
          this.monthlyChecklist = null;
        },
      });
  }

  get currentMonthLabel(): string {
    const now = new Date();
    return now.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  get monthlyChecklistUploadedCount(): number {
    return this.monthlyChecklist?.items.filter((i) => i.uploaded).length ?? 0;
  }

  monthlyDocLabel(docType: string): string {
    return ContractorTasksComponent.MONTHLY_DOC_META[docType]?.label ?? this.formatDocType(docType);
  }

  monthlyDocDesc(docType: string): string {
    return ContractorTasksComponent.MONTHLY_DOC_META[docType]?.desc ?? '';
  }

  formatDocType(docType: string): string {
    return (docType || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  branchName(id: string): string {
    return this.availableBranches.find((b) => b.id === id)?.name ?? id;
  }

  get rejectedChecklistItems(): ChecklistItem[] {
    return (this.monthlyChecklist?.items ?? []).filter(
      (i) => i.uploadedDocs.some((d) => d.status === 'REJECTED'),
    );
  }

  openChecklistUpload(item: ChecklistItem): void {
    this.checklistUploadItem = item;
    this.checklistUploadFile = null;
    const mon = this.monthNames[this.checklistMonth - 1];
    this.checklistUploadTitle = `${this.monthlyDocLabel(item.docType)} - ${mon} ${this.checklistYear}`;
    this.checklistUploadBranchId =
      this.checklistBranchId ||
      item.branchId ||
      (this.availableBranches.length === 1 ? this.availableBranches[0].id : '');
    this.cdr.markForCheck();
  }

  onChecklistFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.checklistUploadFile = input.files?.[0] ?? null;
    this.cdr.markForCheck();
  }

  submitChecklistUpload(): void {
    if (
      !this.checklistUploadItem ||
      !this.checklistUploadFile ||
      !this.checklistUploadBranchId.trim()
    ) {
      return;
    }
    this.checklistUploading = true;
    this.cdr.markForCheck();
    this.contractorProfileApi
      .uploadMonthlyDoc({
        docType: this.checklistUploadItem.docType,
        branchId: this.checklistUploadBranchId,
        title: this.checklistUploadTitle.trim(),
        month: this.checklistMonthParam,
        file: this.checklistUploadFile,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.checklistUploading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Uploaded', 'Document uploaded successfully.');
          this.checklistUploadItem = null;
          this.checklistUploadFile = null;
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Upload failed',
            err?.error?.message || 'Could not upload document.',
          ),
      });
  }

  cancelChecklistUpload(): void {
    this.checklistUploadItem = null;
    this.checklistUploadFile = null;
    this.cdr.markForCheck();
  }

  private mapTaskRow(task: any): UnifiedWorkRow {
    return {
      id: String(task?.id || ''),
      rowType: 'TASK',
      title:
        task?.compliance?.complianceName ||
        task?.compliance?.title ||
        task?.complianceTitle ||
        'Compliance Task',
      status: this.normalizeStatus(task?.status || 'PENDING'),
      dueDate: this.firstDefined(task?.dueDate, task?.due_date),
      branchName:
        task?.branch?.branchName ||
        task?.branch?.name ||
        task?.branchName ||
        '-',
      clientName:
        task?.client?.clientName ||
        task?.clientName ||
        task?.client?.name ||
        '-',
      reason: task?.remarks || '',
      remarks: task?.remarks || '',
      evidenceCount: Number(task?.evidenceCount || 0),
      createdAt: this.firstDefined(task?.createdAt, task?.created_at),
      updatedAt: this.firstDefined(task?.updatedAt, task?.updated_at),
    };
  }

  private mapReuploadRow(req: any): UnifiedWorkRow {
    const documentId = Number(
      this.firstDefined(req?.documentId, req?.docId, req?.doc_id, 0),
    );
    return {
      id: String(this.firstDefined(req?.id, req?.requestId, req?.request_id, '')),
      rowType: 'REUPLOAD',
      title: `Reupload request for document #${documentId || '-'}`,
      status: this.normalizeStatus(req?.status || 'OPEN'),
      dueDate: this.firstDefined(req?.deadlineDate, req?.deadline_date, null),
      branchName: this.firstDefined(req?.branchName, req?.unitName, '-'),
      clientName: this.firstDefined(req?.clientName, '-'),
      reason: this.firstDefined(req?.reason, ''),
      remarks: this.firstDefined(req?.remarksVisible, req?.remarks, req?.crmRemarks, ''),
      documentId: Number.isFinite(documentId) ? documentId : undefined,
      createdAt: this.firstDefined(req?.createdAt, req?.created_at, null),
      submittedAt: this.firstDefined(req?.submittedAt, req?.submitted_at, null),
      updatedAt: this.firstDefined(req?.updatedAt, req?.updated_at, null),
    };
  }

  private mapAuditRow(audit: any): UnifiedWorkRow {
    const branchName = this.firstDefined(audit?.branch?.branchName, audit?.branchName, '-');
    const auditCode = this.firstDefined(audit?.auditCode, audit?.id, 'Audit');
    const auditType = this.firstDefined(audit?.auditType, 'CONTRACTOR_AUDIT');
    const periodCode = this.firstDefined(audit?.periodCode, String(audit?.periodYear || ''), '');
    const auditorFirst = audit?.assignedAuditor?.firstName || '';
    const auditorLast = audit?.assignedAuditor?.lastName || '';
    const auditorName = [auditorFirst, auditorLast].filter(Boolean).join(' ') ||
      (this.firstDefined(audit?.auditorName, '') as string) || '-';
    const rawScore = audit?.score;
    const score = rawScore !== null && rawScore !== undefined ? Number(rawScore) : null;
    return {
      id: String(audit?.id || ''),
      rowType: 'AUDIT',
      title: `${auditCode} — ${auditType}${periodCode ? ' (' + periodCode + ')' : ''}`,
      status: this.normalizeStatus(audit?.status || 'PLANNED'),
      dueDate: this.firstDefined(audit?.scheduledDate, audit?.scheduled_date, audit?.dueDate, audit?.due_date, null),
      scheduledDate: this.firstDefined(audit?.scheduledDate, audit?.scheduled_date, null),
      branchName: String(branchName || '-'),
      clientName: this.firstDefined(audit?.client?.clientName, audit?.clientName, '-') as string,
      reason: this.firstDefined(audit?.notes, ''),
      remarks: this.firstDefined(audit?.notes, ''),
      score,
      auditorName,
      periodCode: String(periodCode || ''),
      frequency: this.firstDefined(audit?.frequency, '') as string,
      finalRemark: this.firstDefined(audit?.finalRemark, audit?.final_remark, '') as string,
      createdAt: this.firstDefined(audit?.createdAt, audit?.created_at, null),
      submittedAt: this.firstDefined(audit?.submittedAt, audit?.submitted_at, null),
      updatedAt: this.firstDefined(audit?.updatedAt, audit?.updated_at, null),
      branchId: this.firstDefined(audit?.branchId, audit?.branch_id, null),
    };
  }

  private mapAuditNcRow(row: any): AuditNonComplianceRow {
    return {
      id: String(this.firstDefined(row?.id, '')),
      auditId: String(this.firstDefined(row?.auditId, row?.audit_id, '')),
      documentName: String(this.firstDefined(row?.documentName, 'Document')),
      remark: String(this.firstDefined(row?.remark, '')),
      status: this.normalizeStatus(row?.status || 'OPEN'),
      raisedAt: this.firstDefined(row?.raisedAt, row?.raised_at, null),
      auditCode: String(this.firstDefined(row?.auditCode, '-')),
      auditType: String(this.firstDefined(row?.auditType, '-')),
      branchName: String(this.firstDefined(row?.branchName, '-')),
    };
  }

  private tryRestoreSelection(): void {
    if (this.pendingTaskIdFromRoute) {
      this.selectFromRouteId(this.pendingTaskIdFromRoute);
      return;
    }

    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('reupload-requests')) {
      const firstReupload = this.filteredRows.find((r) => r.rowType === 'REUPLOAD');
      if (firstReupload) {
        this.selectRow(firstReupload);
        return;
      }
    }

    if (!this.selectedRow && this.filteredRows.length) {
      this.selectRow(this.filteredRows[0]);
    }
  }

  private selectFromRouteId(taskId: string): void {
    const row = this.filteredRows.find(
      (r) => r.rowType === 'TASK' && String(r.id) === String(taskId),
    );
    if (row) {
      this.selectRow(row);
      this.pendingTaskIdFromRoute = null;
    }
  }

  private applyRouteDefaults(): void {
    // Recompute from URL each time query params change to avoid stale view state.
    this.statusFilter = 'ALL';
    this.typeFilter = 'ALL';
    this.freqFilter = 'ALL';
    this.dueFilter = 'ALL';

    const qStatus = (this.route.snapshot.queryParamMap.get('status') || '')
      .trim()
      .toUpperCase();
    if (qStatus) {
      if (qStatus === 'DUE_TODAY') {
        this.dueFilter = 'DUE_TODAY';
      } else if (this.statusOptions.includes(qStatus)) {
        this.statusFilter = qStatus;
      }
    }

    const qType = (this.route.snapshot.queryParamMap.get('type') || '')
      .trim()
      .toUpperCase() as 'ALL' | RowType;
    if (['TASK', 'AUDIT', 'REUPLOAD'].includes(qType)) {
      this.typeFilter = qType;
    }

    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('reupload-requests')) {
      this.typeFilter = 'REUPLOAD';
      this.statusFilter = 'OPEN';
    }
  }

  private matchDueFilter(row: UnifiedWorkRow): boolean {
    if (this.dueFilter === 'ALL') return true;
    if (!row.dueDate) return false;

    const due = new Date(row.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);

    if (this.dueFilter === 'OVERDUE') return diff < 0;
    if (this.dueFilter === 'DUE_TODAY') return diff === 0;
    if (this.dueFilter === 'DUE_7_DAYS') return diff >= 0 && diff <= 7;
    return true;
  }

  private isOpenStatus(status: string): boolean {
    return [
      'OPEN',
      'PENDING',
      'IN_PROGRESS',
      'REJECTED',
      'OVERDUE',
      'PLANNED',
      'CORRECTION_PENDING',
      'REVERIFICATION_PENDING',
    ].includes(status);
  }

  private isOverdueStatus(status: string, dueDate: string | null): boolean {
    if (status === 'OVERDUE') return true;
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime() && this.isOpenStatus(status);
  }

  private normalizeStatus(raw: string): string {
    const value = String(raw || '').trim().toUpperCase();
    return value || 'PENDING';
  }

  private dateValue(dateValue: string | null): number {
    if (!dateValue) return Number.MAX_SAFE_INTEGER;
    const value = new Date(dateValue).getTime();
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  }

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  private sameRow(a: UnifiedWorkRow, b: UnifiedWorkRow): boolean {
    return a.id === b.id && a.rowType === b.rowType;
  }

  private firstDefined<T>(...values: T[]): T | null {
    for (const value of values) {
      if (value !== undefined && value !== null && `${value}` !== '') {
        return value;
      }
    }
    return null;
  }
}
