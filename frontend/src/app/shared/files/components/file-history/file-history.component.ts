import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FileHistoryItem } from '../../models/file.model';

@Component({
  selector: 'app-file-history',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './file-history.component.html',
})
export class FileHistoryComponent {
  @Input() history: FileHistoryItem[] = [];

  open(item: FileHistoryItem): void {
    if (!item.file?.url) return;
    window.open(item.file.url, '_blank');
  }

  statusColor(status: string): string {
    switch (status) {
      case 'APPROVED': return 'bg-green-100 text-green-700';
      case 'REJECTED': return 'bg-red-100 text-red-700';
      case 'RETURNED':
      case 'REUPLOAD_REQUESTED': return 'bg-amber-100 text-amber-700';
      case 'SUBMITTED':
      case 'UPLOADED': return 'bg-blue-100 text-blue-700';
      case 'LOCKED': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }
}
