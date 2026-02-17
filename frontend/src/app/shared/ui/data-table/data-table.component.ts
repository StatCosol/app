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
    <div class="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th *ngFor="let col of columns"
                  [style.width]="col.width"
                  [ngClass]="getHeaderClasses(col)"
                  (click)="col.sortable && onSort(col.key)">
                <div class="flex items-center gap-1.5">
                  <span>{{ col.header }}</span>
                  <ng-container *ngIf="col.sortable">
                    <svg *ngIf="sortColumn !== col.key" class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                    </svg>
                    <svg *ngIf="sortColumn === col.key && sortDirection === 'asc'" class="w-4 h-4 text-statco-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                    </svg>
                    <svg *ngIf="sortColumn === col.key && sortDirection === 'desc'" class="w-4 h-4 text-statco-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </ng-container>
                </div>
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <ng-container *ngIf="loading">
              <tr>
                <td [attr.colspan]="columns.length" class="px-6 py-12 text-center">
                  <div class="flex items-center justify-center">
                    <svg class="animate-spin h-8 w-8 text-statco-blue" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="ml-3 text-gray-500">Loading...</span>
                  </div>
                </td>
              </tr>
            </ng-container>
            <ng-container *ngIf="!loading && data.length === 0">
              <tr>
                <td [attr.colspan]="columns.length" class="px-6 py-12 text-center">
                  <div class="text-gray-500">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                    </svg>
                    <p class="mt-2 text-sm font-medium">{{ emptyMessage }}</p>
                  </div>
                </td>
              </tr>
            </ng-container>
            <ng-container *ngIf="!loading && data.length > 0">
              <tr *ngFor="let row of data; let i = index"
                  class="hover:bg-gray-50 transition-colors duration-150"
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
      <div *ngIf="showPagination && !loading && data.length > 0" class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div class="text-sm text-gray-500">
          Showing {{ startItem }} to {{ endItem }} of {{ totalItems }} results
        </div>
        <div class="flex items-center gap-2">
          <button
            [disabled]="currentPage === 1"
            (click)="onPageChange(currentPage - 1)"
            class="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Previous
          </button>
          <span class="px-3 py-1.5 text-sm text-gray-700">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            [disabled]="currentPage === totalPages"
            (click)="onPageChange(currentPage + 1)"
            class="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Next
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
    const base = 'px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider';
    const align = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
    const cursor = col.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : '';
    return `${base} ${align} ${cursor}`;
  }

  getCellClasses(col: TableColumn): string {
    const base = 'px-6 py-4 text-sm text-gray-900 whitespace-nowrap';
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
