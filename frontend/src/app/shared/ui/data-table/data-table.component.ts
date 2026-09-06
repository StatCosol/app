import { Component, Input, Output, EventEmitter, ContentChildren, QueryList, TemplateRef, Directive , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TableColumn {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Custom value accessor for CSV export — use when the cell is rendered from computed data. */
  exportValue?: (row: any) => unknown;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="animate-fade-up">
      <!-- Export toolbar -->
      @if (exportFileName && !loading && data.length > 0) {
        <div class="flex justify-end mb-2">
          <button
            type="button"
            (click)="exportCsv()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 hover:text-gray-800 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
            </svg>
            Export CSV
          </button>
        </div>
      }

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full table-fixed" [style.min-width]="minWidth">
          <thead>
            <tr>
              @for (col of columns; track col) {
<th
                  scope="col"
                  [style.width]="col.width"
                  [ngClass]="getHeaderClasses(col)"
                  [attr.aria-sort]="col.sortable ? (sortColumn === col.key ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : 'none') : null"
                  (click)="col.sortable && onSort(col.key)">
                <div class="flex items-center gap-1.5" [ngClass]="{'justify-center': col.align === 'center', 'justify-end': col.align === 'right'}">
                  <span>{{ col.header }}</span>
                  @if (col.sortable) {

                    @if (sortColumn !== col.key) {
<svg class="w-3.5 h-3.5 text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                    </svg>
}
                    @if (sortColumn === col.key && sortDirection === 'asc') {
<svg class="w-3.5 h-3.5 text-accent-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"></path>
                    </svg>
}
                    @if (sortColumn === col.key && sortDirection === 'desc') {
<svg class="w-3.5 h-3.5 text-accent-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                    </svg>
}
                  
}
                </div>
              </th>
}
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            @if (loading) {

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
            
}
            @if (!loading && data.length === 0) {

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
            
}
            @if (!loading && data.length > 0) {

              @for (row of data; track row; let i = $index) {
<tr
                  class="hover:bg-gray-50/80 transition-colors duration-150"
                  [class.cursor-pointer]="clickable"
                  (click)="onRowClick(row, i)">
                @for (col of columns; track col) {
<td [ngClass]="getCellClasses(col)">
                  @if (getCellTemplate(col.key); as tmpl) {

                    <ng-container *ngTemplateOutlet="tmpl; context: { $implicit: row, row: row, value: row[col.key], index: i }"></ng-container>
                  
} @else {
{{ row[col.key] }}
}
                  
                </td>
}
              </tr>
}
            
}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      @if (showPagination && !loading && data.length > 0) {
<div
           class="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <div class="text-sm text-gray-500 font-medium">
          Showing <span class="text-gray-800">{{ startItem }}</span> to <span class="text-gray-800">{{ endItem }}</span> of <span class="text-gray-800">{{ totalItems }}</span>
        </div>
        <div class="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-2 py-1.5 shadow-sm whitespace-nowrap">
          <button
            type="button"
            [disabled]="currentPage === 1"
            (click)="onPageChange(1)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-brand-600 transition hover:bg-brand-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            title="First page"
            aria-label="First page">&#171;</button>

          <button
            type="button"
            [disabled]="currentPage === 1"
            (click)="onPageChange(currentPage - 1)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-brand-600 transition hover:bg-brand-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            title="Previous page"
            aria-label="Previous page">&#8249;</button>

          <div class="flex items-center gap-1.5 px-2 text-gray-800">
            <span class="text-sm font-semibold">Page</span>
            <input
              name="uiDataTablePage"
              type="number"
              min="1"
              [max]="totalPages"
              [value]="currentPage"
              (keydown.enter)="commitPageInput($event)"
              (blur)="commitPageInput($event)"
              class="h-8 w-14 rounded-md border border-gray-300 bg-white text-center text-sm font-semibold outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Current page" />
            <span class="text-sm font-semibold">of {{ totalPages }}</span>
          </div>

          <button
            type="button"
            [disabled]="currentPage >= totalPages"
            (click)="onPageChange(currentPage + 1)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-brand-600 transition hover:bg-brand-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            title="Next page"
            aria-label="Next page">&#8250;</button>

          <button
            type="button"
            [disabled]="currentPage >= totalPages"
            (click)="onPageChange(totalPages)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-brand-600 transition hover:bg-brand-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            title="Last page"
            aria-label="Last page">&#187;</button>
        </div>
      </div>
}
    </div>
  `
})
export class DataTableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() loading = false;
  @Input() emptyMessage = 'No data available';
  /**
   * Floor for the table's width before the wrapper starts scrolling.
   *
   * 600px suits the wide tables this was built for — it stops eight columns
   * crushing into an unreadable concertina on a narrow screen. It is wrong for a
   * short one: a three-column table in a side card was pushed past its container
   * and grew a horizontal scrollbar for a single row of data.
   *
   * Kept as the default so every existing table behaves exactly as before, and
   * overridable ("0") where the column count does not need the floor.
   */
  @Input() minWidth = '600px';
  @Input() clickable = false;
  /** When set, an "Export CSV" button is shown that downloads the current rows as <name>.csv */
  @Input() exportFileName = '';

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
    const base = 'px-4 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gradient-to-b from-gray-50 to-gray-100/80 border-b-2 border-gray-200/80 sticky top-0 z-10';
    const align = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
    const cursor = col.sortable ? 'cursor-pointer select-none hover:text-gray-700 transition-colors' : '';
    return `${base} ${align} ${cursor}`;
  }

  getCellClasses(col: TableColumn): string {
    const base = 'px-4 py-4 text-sm text-gray-700 truncate max-w-0';
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
    const safePage = this.normalizePage(page);
    if (safePage === this.currentPage) return;
    this.pageChange.emit({ page: safePage, pageSize: this.pageSize });
  }

  commitPageInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;

    const parsed = Number(input.value);
    const safePage = this.normalizePage(parsed);

    input.value = String(safePage);
    this.onPageChange(safePage);
  }

  onRowClick(row: any, index: number): void {
    if (this.clickable) {
      this.rowClick.emit({ row, index });
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  private normalizePage(page: number): number {
    if (!Number.isFinite(page)) return this.currentPage || 1;
    const rounded = Math.trunc(page);
    return Math.min(this.totalPages, Math.max(1, rounded));
  }

  exportCsv(): void {
    // Columns without a header are action columns — skip them in the export.
    const cols = this.columns.filter((c) => c.header);
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      cols.map((c) => escape(c.header)).join(','),
      ...this.data.map((row) =>
        cols.map((c) => escape(c.exportValue ? c.exportValue(row) : row[c.key])).join(','),
      ),
    ];
    // BOM so Excel opens the file as UTF-8
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  get startItem(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }
}
