import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComplianceTaskFilters } from '../../../core/models/returns.models';

export interface FilterDropdownOption {
  value: string;
  label: string;
}

@Component({
  standalone: true,
  selector: 'app-compliance-advanced-filters',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="adv-filters">
      <!-- Year -->
      <select class="field" [(ngModel)]="filters.periodYear" (ngModelChange)="emit()">
        <option [ngValue]="null">All Years</option>
        <option *ngFor="let y of yearOptions" [ngValue]="y">{{ y }}</option>
      </select>

      <!-- Month -->
      <select class="field" [(ngModel)]="filters.periodMonth" (ngModelChange)="emit()">
        <option [ngValue]="null">All Months</option>
        <option *ngFor="let m of monthOptions" [ngValue]="m.value">{{ m.label }}</option>
      </select>

      <!-- Status -->
      <select class="field" [(ngModel)]="filters.status" (ngModelChange)="emit()">
        <option [ngValue]="null">All Statuses</option>
        <option *ngFor="let s of statusOptions" [value]="s.value">{{ s.label }}</option>
      </select>

      <!-- Law type -->
      <select *ngIf="lawTypeOptions.length" class="field" [(ngModel)]="filters.lawType" (ngModelChange)="emit()">
        <option [ngValue]="null">All Acts</option>
        <option *ngFor="let l of lawTypeOptions" [value]="l.value">{{ l.label }}</option>
      </select>

      <!-- Frequency -->
      <select *ngIf="showFrequency" class="field" [(ngModel)]="filters.frequency" (ngModelChange)="emit()">
        <option [ngValue]="null">All Frequencies</option>
        <option value="MONTHLY">Monthly</option>
        <option value="QUARTERLY">Quarterly</option>
        <option value="HALF_YEARLY">Half-Yearly</option>
        <option value="YEARLY">Yearly</option>
      </select>

      <!-- Pending only -->
      <label class="pending-only">
        <input type="checkbox" [(ngModel)]="filters.pendingOnly" (ngModelChange)="emit()" />
        Pending only
      </label>

      <!-- Reset -->
      <button class="reset-btn" (click)="resetFilters()">Reset</button>
    </div>
  `,
  styles: [`
    .adv-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .field {
      font-size: 0.8125rem;
      padding: 0.35rem 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background: #fff;
      min-width: 7rem;
    }
    .field:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 2px rgba(13,148,136,.15); }
    .pending-only {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8125rem;
      color: #374151;
      white-space: nowrap;
      cursor: pointer;
    }
    .reset-btn {
      font-size: 0.75rem;
      padding: 0.3rem 0.6rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background: #f9fafb;
      cursor: pointer;
      color: #6b7280;
    }
    .reset-btn:hover { background: #f3f4f6; color: #111827; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComplianceAdvancedFiltersComponent {
  @Input() showFrequency = false;
  @Input() lawTypeOptions: FilterDropdownOption[] = [];
  @Input() statusOptions: FilterDropdownOption[] = [
    { value: 'PENDING', label: 'Prepared' },
    { value: 'IN_PROGRESS', label: 'Reviewed' },
    { value: 'SUBMITTED', label: 'Filed' },
    { value: 'APPROVED', label: 'Acknowledged' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'NOT_APPLICABLE', label: 'Not Applicable' },
  ];

  @Output() filtersChange = new EventEmitter<ComplianceTaskFilters>();

  filters: ComplianceTaskFilters = {
    periodYear: null,
    periodMonth: null,
    status: null,
    lawType: null,
    frequency: null,
    pendingOnly: false,
  };

  yearOptions: number[] = [];
  monthOptions = [
    { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' },
  ];

  constructor() {
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 4; y--) this.yearOptions.push(y);
  }

  emit(): void {
    this.filtersChange.emit({ ...this.filters });
  }

  resetFilters(): void {
    this.filters = {
      periodYear: null,
      periodMonth: null,
      status: null,
      lawType: null,
      frequency: null,
      pendingOnly: false,
    };
    this.emit();
  }
}
