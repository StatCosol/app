import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, of, switchMap, takeUntil } from 'rxjs';
import { CrmService } from '../../../core/crm.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';

@Component({
  selector: 'ui-crm-scope-filter',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label for="crm-scope-client"
      >Client
      <select
        id="crm-scope-client"
        name="scopeClient"
        [ngModel]="clientId"
        (ngModelChange)="chooseClient($event)"
      >
        <option value="">All assigned clients</option>
        @for (client of clients; track client.id) {
          <option [value]="client.id">{{ client.label }}</option>
        }
      </select>
    </label>
    <label for="crm-scope-branch"
      >Branch
      <select
        id="crm-scope-branch"
        name="scopeBranch"
        [disabled]="!clientId"
        [ngModel]="branchId"
        (ngModelChange)="branchIdChange.emit($event)"
      >
        <option value="">{{ clientId ? 'All branches' : 'Select a client first' }}</option>
        @for (branch of branches; track branch.id) {
          <option [value]="branch.id">{{ branch.label }}</option>
        }
      </select>
    </label>
    @if (error) {
      <small>{{ error }} <button type="button" (click)="load()">Retry</button></small>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      select {
        padding: 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.5rem;
        background: white;
        max-width: 24rem;
      }
      small {
        color: #b45309;
      }
    `,
  ],
})
export class CrmScopeFilterComponent implements OnInit, OnChanges, OnDestroy {
  @Input() clientId = '';
  @Input() branchId = '';
  @Output() clientIdChange = new EventEmitter<string>();
  @Output() branchIdChange = new EventEmitter<string>();
  clients: { id: string; label: string }[] = [];
  branches: { id: string; label: string }[] = [];
  error = '';
  private readonly changes = new Subject<string>();
  private readonly destroyed = new Subject<void>();
  constructor(
    private readonly crm: CrmService,
    private readonly api: CrmClientsApi,
    private readonly cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    this.changes
      .pipe(
        switchMap((id) =>
          id
            ? this.api.getBranchesForClient(id).pipe(
                catchError(() => {
                  this.error = 'Branch names could not be loaded.';
                  return of([]);
                }),
              )
            : of([]),
        ),
        takeUntil(this.destroyed),
      )
      .subscribe((rows) => {
        this.branches = rows.map((b) => ({
          id: b.id,
          label: b.branchName || 'Branch name unavailable',
        }));
        this.cdr.markForCheck();
      });
    this.load();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['clientId']) {
      this.branches = [];
      this.changes.next(this.clientId);
    }
  }
  load(): void {
    this.error = '';
    this.crm
      .getAssignedClients()
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (rows) => {
          this.clients = rows.map((c) => ({
            id: c.id,
            label: c.clientName || c.name || c.clientCode || 'Client name unavailable',
          }));
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'Client names could not be loaded.';
          this.cdr.markForCheck();
        },
      });
    this.changes.next(this.clientId);
  }
  chooseClient(id: string): void {
    this.error = '';
    this.clientId = id;
    this.branchId = '';
    this.branches = [];
    this.branchIdChange.emit('');
    this.clientIdChange.emit(id);
    this.changes.next(id);
  }
  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }
}
