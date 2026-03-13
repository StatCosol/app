import { Component, Input, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableColumn } from '../../models/table.model';

@Component({
  selector: 'app-column-chooser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './column-chooser.component.html',
})
export class ColumnChooserComponent<T = any> {
  @Input() columns: TableColumn<T>[] = [];
  @Output() changed = new EventEmitter<TableColumn<T>[]>();

  open = false;

  constructor(private elRef: ElementRef) {}

  toggle(): void {
    this.open = !this.open;
  }

  set(col: TableColumn<T>, checked: boolean): void {
    const updated = this.columns.map(c =>
      c.key === col.key ? { ...c, hidden: !checked } : c,
    );
    this.changed.emit(updated);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: Event): void {
    if (this.open && !this.elRef.nativeElement.contains(event.target)) {
      this.open = false;
    }
  }
}
