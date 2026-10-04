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
import { Subject, catchError, of, switchMap, takeUntil } from 'rxjs';
import {
  ClientEmployeesService,
  Employee,
} from '../../../pages/client/employees/client-employees.service';

@Component({
  selector: 'ui-employee-selector',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label for="correction-employee-search">Find employee</label>
    <input
      id="correction-employee-search"
      name="employeeSearch"
      type="search"
      [(ngModel)]="search"
      placeholder="Employee name or code"
      (keyup.enter)="find()"
    />
    <button type="button" (click)="find()">Search</button>
    <select
      id="correction-employee"
      name="correctionEmployee"
      aria-label="Employee"
      [ngModel]="value"
      (ngModelChange)="choose($event)"
    >
      <option value="">Select employee</option>
      @if (selected && !hasSelectedResult()) {
        <option [value]="selected.id">{{ label(selected) }}</option>
      }
      @for (employee of employees; track employee.id) {
        <option [value]="employee.id">{{ label(employee) }}</option>
      }
    </select>
    <small>{{ message }}</small>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      input,
      select {
        border: 1px solid #d1d5db;
        border-radius: 0.5rem;
        padding: 0.5rem;
      }
    `,
  ],
})
export class EmployeeSelectorComponent implements OnInit, OnDestroy {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  search = '';
  employees: Employee[] = [];
  selected?: Employee;
  message = '';
  private readonly searches = new Subject<string>();
  private readonly destroyed = new Subject<void>();
  constructor(
    private readonly service: ClientEmployeesService,
    private readonly cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    this.searches
      .pipe(
        switchMap((search) => {
          this.message = 'Loading employees…';
          return this.service.list({ search, limit: 25 }).pipe(
            catchError(() => {
              this.message = 'Employees could not be loaded. Try searching again.';
              return of(null);
            }),
          );
        }),
        takeUntil(this.destroyed),
      )
      .subscribe((result) => {
        this.employees = result?.data ?? [];
        if (result)
          this.message =
            result.total > 25
              ? 'Showing 25 matches. Search by name or code to narrow the list.'
              : result.total
                ? ''
                : 'No employees found.';
        this.cdr.markForCheck();
      });
    this.find();
  }
  find(): void {
    this.searches.next(this.search.trim());
  }
  choose(id: string): void {
    this.selected =
      this.employees.find((employee) => employee.id === id) ??
      (this.selected?.id === id ? this.selected : undefined);
    this.value = id;
    this.valueChange.emit(id);
  }
  hasSelectedResult(): boolean {
    return this.employees.some((employee) => employee.id === this.selected?.id);
  }
  label(employee: Employee): string {
    return (
      [employee.name, employee.employeeCode].filter(Boolean).join(' — ') ||
      'Employee name unavailable'
    );
  }
  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }
}
