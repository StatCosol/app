import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

const COLOR_MAP: Record<string, string> = {
  OPEN: 'badge-success',
  CLOSED: 'badge-gray',
  APPLICABLE: 'badge-success',
  NOT_APPLICABLE: 'badge-danger',
  ACTIVE: 'badge-success',
  INACTIVE: 'badge-gray',
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  SUBMITTED: 'badge-primary',
  OVERDUE: 'badge-danger',
  COMPLETED: 'badge-success',
};

const LABEL_MAP: Record<string, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  APPLICABLE: 'Applicable',
  NOT_APPLICABLE: 'Not Applicable',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUBMITTED: 'Submitted',
  OVERDUE: 'Overdue',
  COMPLETED: 'Completed',
};

@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-chip.component.html',
  styleUrls: ['./status-chip.component.css'],
})
export class StatusChipComponent {
  @Input() status: string | null = null;
  @Input() size: 'sm' | 'md' = 'md';

  get label(): string {
    const key = this.normalized;
    return (key && LABEL_MAP[key]) || (this.status ?? '');
  }

  get classes(): string[] {
    const key = this.normalized;
    const tone = (key && COLOR_MAP[key]) || 'badge-gray';
    return ['badge', tone, this.size === 'sm' ? 'text-xs' : ''];
  }

  private get normalized(): string | null {
    return this.status ? String(this.status).toUpperCase() : null;
  }
}
