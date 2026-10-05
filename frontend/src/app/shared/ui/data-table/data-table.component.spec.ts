import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { DataTableComponent } from './data-table.component';

describe('table record search', () => {
  it('preserves source indices for editable cells and row actions after filtering', () => {
    const table = new DataTableComponent();
    table.columns = [{ key: 'name', header: 'Name' }];
    table.data = [{ name: 'Alpha' }, { name: 'Beta' }];
    table.searchTerm = '  BETA  ';
    expect(table.displayedRows).toEqual([{ row: table.data[1], index: 1 }]);
    table.searchTerm = '';
    expect(table.displayedRows).toHaveLength(2);
  });

  it('searches computed cell values and handles missing values', () => {
    const table = new DataTableComponent();
    table.columns = [{ key: 'branch', header: 'Branch', exportValue: row => row.branch?.name }];
    table.data = [{ branch: null }, { branch: { name: 'Hyderabad' } }];
    table.searchTerm = 'hyderabad';
    expect(table.displayedRows.map(entry => entry.index)).toEqual([1]);
    table.searchTerm = 'unknown';
    expect(table.displayedRows).toEqual([]);
    table.enableSearch = false;
    expect(table.displayedRows).toHaveLength(2);
  });
});
