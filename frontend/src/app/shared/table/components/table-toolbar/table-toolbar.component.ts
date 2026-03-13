import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableColumn, TableQuery } from '../../models/table.model';
import { ColumnChooserComponent } from '../column-chooser/column-chooser.component';

@Component({
  selector: 'app-table-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnChooserComponent],
  templateUrl: './table-toolbar.component.html',
})
export class TableToolbarComponent<T = any> implements OnChanges {
  @Input() enableSearch = true;
  @Input() enableColumnChooser = true;
  @Input() query!: TableQuery;
  @Input() columns: TableColumn<T>[] = [];

  @Output() searchChange = new EventEmitter<string>();
  @Output() limitChange = new EventEmitter<number>();
  @Output() columnsChange = new EventEmitter<TableColumn<T>[]>();

  q = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['query']) {
      this.q = this.query?.q || '';
    }
  }

  onQChange(v: string): void {
    this.q = v;
    this.searchChange.emit(v);
  }

  setLimit(v: string): void {
    this.limitChange.emit(Number(v));
  }

  onColumns(cols: TableColumn<T>[]): void {
    this.columnsChange.emit(cols);
  }
}
