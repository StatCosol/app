import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ClientBranchesService } from '../../../core/client-branches.service';

export type BranchLabelOption = { id: string; label: string };

@Component({
  selector: 'ui-branch-filter',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label [for]="inputId">Branch</label>
    <select
      [id]="inputId"
      [name]="inputId"
      [ngModel]="value"
      (ngModelChange)="valueChange.emit($event)"
    >
      <option value="">All assigned branches</option>
      @for (branch of options; track branch.id) {
        <option [value]="branch.id">{{ branch.label }}</option>
      }
    </select>
    @if (error) {
      <small
        >Branch names could not be loaded.
        <button type="button" (click)="load()">Retry</button></small
      >
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      select {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.5rem;
        background: white;
      }
      small {
        color: #b45309;
      }
    `,
  ],
})
export class BranchFilterComponent implements OnInit, OnDestroy {
  @Input() value = '';
  @Input() inputId = 'branch-filter';
  @Output() valueChange = new EventEmitter<string>();
  @Output() optionsLoaded = new EventEmitter<BranchLabelOption[]>();
  options: BranchLabelOption[] = [];
  error = false;
  private readonly destroyed = new Subject<void>();
  constructor(
    private readonly service: ClientBranchesService,
    private readonly cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    this.load();
  }
  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }
  load(): void {
    this.error = false;
    this.service
      .list()
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (rows) => {
          this.options = rows.map((b) => ({
            id: b.id,
            label:
              b.branchName || b.branchname || b.name || b.branchCode || 'Branch name unavailable',
          }));
          this.optionsLoaded.emit(this.options);
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = true;
          this.cdr.markForCheck();
        },
      });
  }
}
