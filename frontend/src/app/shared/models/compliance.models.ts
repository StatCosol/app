// ───────────────────────────────────────────────────────────
// Compliance Workflow — Single Source of Truth
// Used by CRM, LegitX (Master Client), BranchDesk, ConTrack
// ───────────────────────────────────────────────────────────

/** Period cadence for a compliance task */
export type PeriodType =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY'
  | 'ONE_TIME';

/** Universal task status across all modules */
export type ComplianceTaskStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'OVERDUE'
  | 'WAIVED';

/** MCD (Monthly Compliance Data) lifecycle status */
export type McdStatus =
  | 'OPEN'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'OVERDUE';

/** Per-upload evidence review outcome */
export type EvidenceStatus =
  | 'UPLOADED'
  | 'IN_REVIEW'
  | 'ACCEPTED'
  | 'NEEDS_REUPLOAD'
  | 'REUPLOAD_REQUIRED';

/** Risk severity (dashboard & scoring) */
export type RiskRating = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Law domain / compliance category */
export type LawDomain =
  | 'PF'
  | 'ESI'
  | 'PT'
  | 'FACTORIES'
  | 'CLRA'
  | 'POSH'
  | 'PAYMENT_OF_WAGES'
  | 'BONUS'
  | 'GRATUITY'
  | 'OTHER';

// ───────── DTOs ─────────

/** Compliance task as returned by backend list/detail endpoints */
export interface ComplianceTaskDto {
  id: string | number;
  clientId: string;
  branchId?: string | null;

  taskCode?: string | null;
  taskName?: string | null;

  /** e.g. 'PF ECR Filing' or law label */
  complianceName?: string | null;

  periodType?: PeriodType | null;
  /** YYYY-MM key for monthly periods */
  monthKey?: string | null;
  periodYear?: number | null;
  periodMonth?: number | null;

  dueDate: string; // ISO date string

  status: ComplianceTaskStatus;
  riskRating?: RiskRating | null;

  mcdRequired?: boolean;
  hasEvidence?: boolean;

  /** CRM who owns the task review */
  assignedByUserId?: string | null;
  /** Contractor / branch user assigned to do the work */
  assignedToUserId?: string | null;

  /** Last CRM remark (approval/rejection) */
  remarks?: string | null;

  /** Who approved this task */
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  approvedBy?: { name?: string; [key: string]: any } | null;

  createdAt?: string;
  updatedAt?: string;

  /** Nested relations returned by backend eager-loading */
  compliance?: { complianceName?: string; [key: string]: any } | null;
  branch?: { branchName?: string; [key: string]: any } | null;
  assignedTo?: { name?: string; [key: string]: any } | null;
  [key: string]: any;
}

/** MCD row for tracker views */
export interface McdRowDto {
  branchId: string;
  branchName?: string;
  monthKey: string;
  status: McdStatus;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  remarksLast?: string | null;
  revision?: number;

  /** snake_case aliases returned by some backend queries */
  branch_name?: string;
  branch_id?: string;
  client_name?: string;
  clientName?: string;
  total_applicable?: number;
  totalApplicable?: number;

  /** Counters for MCD progress */
  uploaded?: number;
  pending?: number;
  returned?: number;
  reviewed?: number;

  /** Completion percentage (0..100) */
  pct?: number;

  /** Whether this MCD row has been finalized */
  finalized?: boolean;

  [key: string]: any;
}

/** Evidence file record */
export interface EvidenceDto {
  id: string;
  taskId?: string | number | null;
  mcdId?: string | null;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  storagePath?: string;
  status: EvidenceStatus;
  reviewRemarks?: string | null;
  uploadedAt?: string;
  reviewedAt?: string | null;
}

/** Generic paginated response */
export interface Paged<T> {
  items: T[];
  total: number;
}
