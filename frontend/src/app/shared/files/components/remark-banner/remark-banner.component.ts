import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileDecisionStatus } from '../../models/file.model';

@Component({
  selector: 'app-remark-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './remark-banner.component.html',
})
export class RemarkBannerComponent {
  @Input() status?: FileDecisionStatus;
  @Input() remark?: string;

  get show(): boolean {
    return this.status === 'RETURNED'
      || this.status === 'REJECTED'
      || this.status === 'REUPLOAD_REQUESTED';
  }

  get bannerClass(): string {
    switch (this.status) {
      case 'REJECTED':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'RETURNED':
      case 'REUPLOAD_REQUESTED':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  }

  get iconClass(): string {
    return this.status === 'REJECTED' ? 'text-red-500' : 'text-amber-500';
  }

  get label(): string {
    switch (this.status) {
      case 'REJECTED': return 'Rejected';
      case 'RETURNED': return 'Returned';
      case 'REUPLOAD_REQUESTED': return 'Reupload Requested';
      default: return this.status || '';
    }
  }
}
