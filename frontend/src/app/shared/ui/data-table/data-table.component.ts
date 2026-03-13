import { Component, Input, Output, EventEmitter, ContentChildren, QueryList, TemplateRef, Directive } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TableColumn {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface SortEvent {
  column: string;
  direction: 'asc' | 'desc' | null;
}

export interface PaginationEvent {
  page: number;
  pageSize: number;
}

@Directive({
  selector: '[uiTableCell]',
  standalone: true,
})
export class TableCellDirective {
  @Input('uiTableCell') columnKey = '';
  constructor(public template: TemplateRef<any>) {}
}

@Component({
  selector: 'ui-data-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden" style="animation: fadeUp 0.4s ease-out both">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead>
            <tr>
              <th *ngFor="let col of columns"
                  [style.width]="col.width"
                  [ngClass]="getHeaderClasses(col)"
                  (click)="col.sortable && onSort(col.key)">
                <div class="flex items-center gap-1.5">
                  <span>{{ col.header }}</span>
                  <ng-container *ngIf="col.sortable">
                    <svg *ngIf="sortColumn !== col.key" class="w-3.5 h-3.5 text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                    </svg>
                    <svg *ngIf="sortColumn === col.key && sortDirection === 'asc'" class="w-3.5 h-3.5 text-accent-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"></path>
                    </svg>
                    <svg *ngIf="sortColumn === col.key && sortDirection === 'desc'" class="w-3.5 h-3.5 text-accent-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </ng-container>
                </div>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <ng-container *ngIf="loading">
              <tr>
                <td [attr.colspan]="columns.length" class="px-6 py-16 text-center">
                  <div class="flex flex-col items-center justify-center gap-3">
                    <svg class="animate-spin h-8 w-8 text-accent-400" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="text-sm font-medium text-gray-500">Loading data...</span>
                  </div>
                </td>
              </tr>
            </ng-container>
            <ng-container *ngIf="!loading && data.length === 0">
              <tr>
                <td [attr.colspan]="columns.length" class="px-6 py-16 text-center">
                  <div class="flex flex-col items-center">
                    <div class="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                      <svg class="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                      </svg>
                    </div>
                    <p class="text-sm font-semibold text-gray-700">{{ emptyMessage }}</p>
                    <p class="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            </ng-container>
            <ng-container *ngIf="!loading && data.length > 0">
              <tr *ngFor="let row of data; let i = index"
                  class="hover:bg-gray-50/80 transition-colors duration-150"
                  [class.cursor-pointer]="clickable"
                  (click)="onRowClick(row, i)">
                <td *ngFor="let col of columns" [ngClass]="getCellClasses(col)">
                  <ng-container *ngIf="getCellTemplate(col.key) as tmpl; else defaultCell">
                    <ng-container *ngTemplateOutlet="tmpl; context: { $implicit: row, row: row, value: row[col.key], index: i }"></ng-container>
                  </ng-container>
                  <ng-template #defaultCell>{{ row[col.key] }}</ng-template>
                </td>
              </tr>
            </ng-container>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div *ngIf="showPagination && !loading && data.length > 0"
           class="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <div class="text-sm text-gray-500 font-medium">
          Showing <span class="text-gray-800">{{ startItem }}</span> to <span class="text-gray-800">{{ endItem }}</span> of <span class="text-gray-800">{{ totalItems }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            [disabled]="currentPage === 1"
            (click)="onPageChange(currentPage - 1)"
            class="btn-secondary px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span class="px-3 py-1.5 text-sm font-semibold text-gray-700 tabular-nums">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            [disabled]="currentPage === totalPages"
            (click)="onPageChange(currentPage + 1)"
            class="btn-secondary px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  `
})
export class DataTableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() loading = false;
  @Input() emptyMessage = 'No data available';
  @Input() clickable = false;

  // Sorting
  @Input() sortColumn: string | null = null;
  @Input() sortDirection: 'asc' | 'desc' | null = null;
  @Output() sortChange = new EventEmitter<SortEvent>();

  // Pagination
  @Input() showPagination = false;
  @Input() currentPage = 1;
  @Input() pageSize = 10;
  @Input() totalItems = 0;
  @Output() pageChange = new EventEmitter<PaginationEvent>();

  // Row click
  @Output() rowClick = new EventEmitter<{ row: any; index: number }>();

  // Cell templates
  @ContentChildren(TableCellDirective) cellTemplates!: QueryList<TableCellDirective>;

  getCellTemplate(columnKey: string): TemplateRef<any> | null {
    const directive = this.cellTemplates?.find(t => t.columnKey === columnKey);
    return directive?.template || null;
  }

  getHeaderClasses(col: TableColumn): string {
    const base = 'px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gradient-to-b from-gray-50 to-gray-100/80 border-b-2 border-gray-200/80';
    const align = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
    const cursor = col.sortable ? 'cursor-pointer select-none hover:text-gray-700 transition-colors' : '';
    return `${base} ${align} ${cursor}`;
  }

  getCellClasses(col: TableColumn): string {
    const base = 'px-6 py-4 text-sm text-gray-700 whitespace-nowrap';
    const align = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
    return `${base} ${align}`;
  }

  onSort(column: string): void {
    let direction: 'asc' | 'desc' | null = 'asc';

    if (this.sortColumn === column) {
      if (this.sortDirection === 'asc') direction = 'desc';
      else if (this.sortDirection === 'desc') direction = null;
    }

    this.sortChange.emit({ column, direction });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.pageChange.emit({ page, pageSize: this.pageSize });
    }
  }

  onRowClick(row: any, index: number): void {
    if (this.clickable) {
      this.rowClick.emit({ row, index });
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  get startItem(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }
}
