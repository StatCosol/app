import { Component, Input, Output, EventEmitter, ContentChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableColumn, TableQuery, SortOrder } from '../../models/table.model';
import { TableToolbarComponent } from '../table-toolbar/table-toolbar.component';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, TableToolbarComponent],
  templateUrl: './data-table.component.html',
})
export class SmartDataTableComponent<T = any> {
  // Data
  @Input() columns: TableColumn<T>[] = [];
  @Input() rows: T[] = [];
  @Input() total = 0;
  @Input() loading = false;
  @Input() emptyMessage = 'No records found for selected filters.';

  // Query state (controlled from parent)
  @Input() query: TableQuery = { page: 1, limit: 10 };

  // Feature toggles
  @Input() enableSearch = true;
  @Input() enableColumnChooser = true;
  @Input() enableSelection = false;
  @Input() enablePagination = true;

  // Selection
  @Input() rowKey: (row: T) => string = (r: any) => r?.id;
  selectedKeys = new Set<string>();

  // Outputs
  @Output() queryChange = new EventEmitter<TableQuery>();
  @Output() selectionChange = new EventEmitter<string[]>();

  // Projection templates
  @ContentChild('rowActions', { static: false }) rowActionsTpl?: TemplateRef<any>;
  @ContentChild('cell', { static: false }) cellTpl?: TemplateRef<any>;

  visibleColumns(): TableColumn<T>[] {
    return (this.columns || []).filter(c => !c.hidden);
  }

  // ── Search ──
  onSearch(q: string): void {
    this.query = { ...this.query, q, page: 1 };
    this.queryChange.emit(this.query);
  }

  // ── Sort ──
  sortBy(col: TableColumn<T>): void {
    if (!col.sortable) return;
    const key = String(col.key);
    let order: SortOrder = 'ASC';
    if (this.query.sort === key) {
      order = this.query.order === 'ASC' ? 'DESC' : 'ASC';
    }
    this.query = { ...this.query, sort: key, order, page: 1 };
    this.queryChange.emit(this.query);
  }

  // ── Pagination ──
  goToPage(page: number): void {
    const safePage = this.normalizePage(page);
    if (safePage === this.query.page) return;
    this.query = { ...this.query, page: safePage };
    this.queryChange.emit(this.query);
  }

  commitPageInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;

    const parsed = Number(input.value);
    const safePage = this.normalizePage(parsed);

    input.value = String(safePage);
    this.goToPage(safePage);
  }

  setLimit(limit: number): void {
    this.query = { ...this.query, limit, page: 1 };
    this.queryChange.emit(this.query);
  }

  // ── Selection ──
  toggleRow(row: T, checked: boolean): void {
    const key = this.rowKey(row);
    if (checked) this.selectedKeys.add(key);
    else this.selectedKeys.delete(key);
    this.selectionChange.emit([...this.selectedKeys]);
  }

  toggleAll(checked: boolean): void {
    if (!checked) this.selectedKeys.clear();
    else (this.rows || []).forEach(r => this.selectedKeys.add(this.rowKey(r)));
    this.selectionChange.emit([...this.selectedKeys]);
  }

  isAllSelected(): boolean {
    return (this.rows || []).length > 0 && (this.rows || []).every(r => this.selectedKeys.has(this.rowKey(r)));
  }

  isSelected(row: T): boolean {
    return this.selectedKeys.has(this.rowKey(row));
  }

  // ── Column chooser callback ──
  onColumnsUpdated(cols: TableColumn<T>[]): void {
    this.columns = cols;
  }

  // ── Helpers ──
  displayCell(col: TableColumn<T>, row: T): any {
    if (col.format) return col.format(row);
    if (col.value) return col.value(row);
    return (row as any)?.[col.key as any];
  }

  totalPages(): number {
    return Math.max(1, Math.ceil((this.total || 0) / (this.query.limit || 10)));
  }

  private normalizePage(page: number): number {
    if (!Number.isFinite(page)) return this.query.page || 1;
    const rounded = Math.trunc(page);
    return Math.min(this.totalPages(), Math.max(1, rounded));
  }

  colSpan(): number {
    return this.visibleColumns().length + (this.enableSelection ? 1 : 0) + (this.rowActionsTpl ? 1 : 0);
  }

  get startItem(): number {
    return Math.min((this.query.page - 1) * this.query.limit + 1, this.total);
  }

  get endItem(): number {
    return Math.min(this.query.page * this.query.limit, this.total);
  }
}
