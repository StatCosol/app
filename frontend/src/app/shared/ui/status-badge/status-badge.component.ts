import { Component, Input } from '@angular/core';
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
  PENDING: 'warning',
  IN_PROGRESS: 'warning',
  PROCESSING: 'warning',
  UNDER_REVIEW: 'warning',
  SUBMITTED: 'primary',
  RESUBMITTED: 'info',
  NOT_UPLOADED: 'gray',
  REUPLOAD_REQUIRED: 'warning',
  DRAFT: 'gray',
  INACTIVE: 'gray',
  CLOSED: 'gray',
  CANCELLED: 'gray',
  NOT_APPLICABLE: 'gray',
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
  DRAFT: 'Draft',
  INACTIVE: 'Inactive',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  NOT_APPLICABLE: 'N/A',
  REJECTED: 'Rejected',
  OVERDUE: 'Overdue',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  ESCALATED: 'Escalated',
  INFO: 'Info',
  NEW: 'New',
};

@Component({
  selector: 'ui-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [ngClass]="badgeClasses">
      <span *ngIf="showDot" class="w-1.5 h-1.5 rounded-full mr-1.5" [ngClass]="dotClass"></span>
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
    const base = 'inline-flex items-center font-medium rounded-full';

    const sizeClasses: Record<string, string> = {
      sm: 'px-2 py-0.5 text-xs',
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
}
