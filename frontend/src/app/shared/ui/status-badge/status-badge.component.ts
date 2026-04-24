import { Component, Input , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'gray';

const STATUS_VARIANT_MAP: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  OPEN: 'success',
  APPLICABLE: 'success',
  PAID: 'success',
  VERIFIED: 'success',
  ACCEPTED: 'success',
  COMPLIANT: 'success',
  RESOLVED: 'success',
  SETTLED: 'success',
  DOCS_ISSUED: 'success',
  CLOSED: 'gray',
  PENDING: 'warning',
  IN_PROGRESS: 'warning',
  PROCESSING: 'warning',
  UNDER_REVIEW: 'warning',
  NEEDS_REUPLOAD: 'warning',
  REUPLOAD_REQUIRED: 'warning',
  NEEDS_CLARIFICATION: 'warning',
  AWAITING_CLIENT: 'warning',
  AWAITING_REUPLOAD: 'warning',
  READY_FOR_VERIFICATION: 'warning',
  PENDING_UPLOAD: 'warning',
  QUERY_PENDING: 'warning',
  INITIATED: 'warning',
  ACKNOWLEDGED: 'info',
  SUBMITTED: 'primary',
  IN_REVIEW: 'primary',
  PLANNED: 'primary',
  SCHEDULED: 'primary',
  PENDING_SUBMISSION: 'primary',
  CORRECTION_PENDING: 'primary',
  REVERIFICATION_PENDING: 'primary',
  REVERIFIED: 'primary',
  RECEIVED: 'primary',
  RESPONSE_DRAFTED: 'info',
  RESPONSE_SUBMITTED: 'info',
  ACTION_REQUIRED: 'warning',
  NC_RAISED: 'error',
  REUPLOADED: 'info',
  RESUBMITTED: 'info',
  NOT_UPLOADED: 'gray',
  DRAFT: 'gray',
  INACTIVE: 'gray',
  CANCELLED: 'gray',
  NOT_APPLICABLE: 'gray',
  WAIVED: 'gray',
  RETURNED: 'warning',
  LOCKED: 'gray',
  SELF_SUBMITTED: 'info',
  MANAGER_REVIEWED: 'info',
  BRANCH_REVIEWED: 'info',
  CLIENT_APPROVED: 'success',
  SENT_BACK: 'warning',
  REJECTED: 'error',
  OVERDUE: 'error',
  FAILED: 'error',
  EXPIRED: 'error',
  ESCALATED: 'error',
  INFO: 'info',
  NEW: 'info',
};

const STATUS_LABEL_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  OPEN: 'Open',
  APPLICABLE: 'Applicable',
  PAID: 'Paid',
  VERIFIED: 'Verified',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PROCESSING: 'Processing',
  UNDER_REVIEW: 'Under Review',
  SUBMITTED: 'Submitted',
  RESUBMITTED: 'Resubmitted',
  NOT_UPLOADED: 'Not Uploaded',
  REUPLOAD_REQUIRED: 'Reupload Required',
  NEEDS_REUPLOAD: 'Needs Reupload',
  NEEDS_CLARIFICATION: 'Needs Clarification',
  DRAFT: 'Draft',
  INACTIVE: 'Inactive',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  NOT_APPLICABLE: 'N/A',
  WAIVED: 'Waived',
  REJECTED: 'Rejected',
  OVERDUE: 'Overdue',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  ESCALATED: 'Escalated',
  IN_REVIEW: 'In Review',
  ACCEPTED: 'Accepted',
  ACKNOWLEDGED: 'Acknowledged',
  COMPLIANT: 'Compliant',
  RESOLVED: 'Resolved',
  SETTLED: 'Settled',
  DOCS_ISSUED: 'Docs Issued',
  INITIATED: 'Initiated',
  PLANNED: 'Planned',
  SCHEDULED: 'Scheduled',
  PENDING_SUBMISSION: 'Pending Submission',
  CORRECTION_PENDING: 'Correction Pending',
  REVERIFICATION_PENDING: 'Reverification Pending',
  REVERIFIED: 'Reverified',
  RECEIVED: 'Received',
  ACTION_REQUIRED: 'Action Required',
  RESPONSE_DRAFTED: 'Response Drafted',
  RESPONSE_SUBMITTED: 'Response Submitted',
  AWAITING_CLIENT: 'Awaiting Client',
  AWAITING_REUPLOAD: 'Awaiting Reupload',
  READY_FOR_VERIFICATION: 'Ready for Verification',
  PENDING_UPLOAD: 'Pending Upload',
  QUERY_PENDING: 'Query Pending',
  NC_RAISED: 'NC Raised',
  REUPLOADED: 'Reuploaded',
  RETURNED: 'Returned',
  LOCKED: 'Locked',
  SENT_BACK: 'Sent Back',
  SELF_SUBMITTED: 'Self Submitted',
  MANAGER_REVIEWED: 'Manager Reviewed',
  BRANCH_REVIEWED: 'Branch Reviewed',
  CLIENT_APPROVED: 'Client Approved',
  INFO: 'Info',
  NEW: 'New',
};

@Component({
  selector: 'ui-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <span [ngClass]="badgeClasses" style="box-shadow: 0 1px 2px rgba(0,0,0,0.05)">
      <span *ngIf="showDot" class="w-2 h-2 rounded-full mr-1.5" [ngClass]="dotClass"
            [style.boxShadow]="'0 0 0 2px ' + dotGlowColor"></span>
      {{ displayLabel }}
    </span>
  `
})
export class StatusBadgeComponent {
  @Input() status: string | null = null;
  @Input() variant?: BadgeVariant;
  @Input() label?: string;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() showDot = false;

  get normalizedStatus(): string {
    return this.status ? String(this.status).toUpperCase().replace(/ /g, '_') : '';
  }

  get displayLabel(): string {
    if (this.label) return this.label;
    return STATUS_LABEL_MAP[this.normalizedStatus] || this.status || '';
  }

  get resolvedVariant(): BadgeVariant {
    if (this.variant) return this.variant;
    return STATUS_VARIANT_MAP[this.normalizedStatus] || 'gray';
  }

  get badgeClasses(): string {
    const base = 'inline-flex items-center font-semibold rounded-full';

    const sizeClasses: Record<string, string> = {
      sm: 'px-2 py-0.5 text-[10px]',
      md: 'px-2.5 py-0.5 text-xs',
      lg: 'px-3 py-1 text-sm',
    };

    const variantClasses: Record<BadgeVariant, string> = {
      primary: 'bg-statco-blue/10 text-statco-blue',
      success: 'bg-success-100 text-success-700',
      warning: 'bg-warning-100 text-warning-700',
      error: 'bg-error-100 text-error-700',
      info: 'bg-info-100 text-info-700',
      gray: 'bg-gray-100 text-gray-700',
    };

    return `${base} ${sizeClasses[this.size]} ${variantClasses[this.resolvedVariant]}`;
  }

  get dotClass(): string {
    const dotColors: Record<BadgeVariant, string> = {
      primary: 'bg-statco-blue',
      success: 'bg-success-500',
      warning: 'bg-warning-500',
      error: 'bg-error-500',
      info: 'bg-info-500',
      gray: 'bg-gray-500',
    };
    return dotColors[this.resolvedVariant];
  }

  get dotGlowColor(): string {
    const glowColors: Record<BadgeVariant, string> = {
      primary: 'rgba(10, 38, 86, 0.2)',
      success: 'rgba(34, 197, 94, 0.2)',
      warning: 'rgba(245, 158, 11, 0.2)',
      error: 'rgba(239, 68, 68, 0.2)',
      info: 'rgba(59, 130, 246, 0.2)',
      gray: 'rgba(156, 163, 175, 0.2)',
    };
    return glowColors[this.resolvedVariant];
  }
}
