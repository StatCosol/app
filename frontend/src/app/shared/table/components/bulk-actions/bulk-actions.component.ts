import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BulkAction } from '../../models/table.model';

@Component({
  selector: 'app-bulk-actions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bulk-actions.component.html',
})
export class BulkActionsComponent {
  @Input() selectedCount = 0;
  @Input() actions: BulkAction[] = [];
  @Output() action = new EventEmitter<string>();
}
