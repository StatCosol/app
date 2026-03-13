import {
  Component, Input, Output, EventEmitter,
  OnInit, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { FilterState, ClientOption, BranchOption } from '../../models/filter.model';
import { FilterContextService } from '../../services/filter-context.service';
import { FilterOptionsService } from '../../services/filter-options.service';

export type OptionsMode = 'ADMIN' | 'CRM' | 'CLIENT' | 'BRANCH' | 'PAYDEK' | 'AUDITOR' | 'CEO' | 'CCO';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBarComponent implements OnInit {
  /** Storage key for persistence */
  @Input() contextKey = 'default';

  /** Visibility toggles */
  @Input() showClient = false;
  @Input() showBranch = true;
  @Input() showMonth = true;
  @Input() showFY = false;
  @Input() showSearch = false;

  /** Lock controls for restricted roles */
  @Input() lockClient = false;
  @Input() lockBranch = false;

  /** Determines which option-loader endpoints to call */
  @Input() optionsMode: OptionsMode = 'CLIENT';

  @Output() changed = new EventEmitter<FilterState>();
  @Output() monthChanged = new EventEmitter<string>();

  state: FilterState = { mode: 'MONTH', month: '' };

  clients: ClientOption[] = [];
  branches: BranchOption[] = [];
  fyOptions: string[] = [];

  loadingClients = false;
  loadingBranches = false;

  constructor(
    public ctx: FilterContextService,
    private opts: FilterOptionsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const saved = this.ctx.get(this.contextKey);

    this.state.mode = this.showFY ? 'FY' : 'MONTH';
    this.state.month = (saved.month as string) || this.ctx.defaultMonth();
    this.state.fy = (saved.fy as string) || this.ctx.defaultFY();
    this.state.clientId = saved.clientId as string | undefined;
    this.state.branchId = saved.branchId as string | undefined;
    this.state.q = (saved.q as string) || '';

    this.fyOptions = this.ctx.fyOptions(5);
    this.loadOptions();
  }

  // ── Public handlers ──

  onClientChange(id: string): void {
    this.state.clientId = id;
    this.state.branchId = undefined;
    this.loadBranches();
  }

  onBranchChange(id: string): void {
    this.state.branchId = id || undefined;
    this.persistAndEmit();
  }

  onMonthChange(m: string): void {
    this.state.mode = 'MONTH';
    this.state.month = m;
    this.persistAndEmit();
    this.monthChanged.emit(m);
  }

  onFYChange(fy: string): void {
    this.state.mode = 'FY';
    this.state.fy = fy;
    this.persistAndEmit();
  }

  onSearch(q: string): void {
    this.state.q = q;
    this.persistAndEmit();
  }

  // ── Option loading ──

  private loadOptions(): void {
    if (this.showClient) {
      this.loadClients();
    } else {
      this.loadBranches();
    }
  }

  private loadClients(): void {
    this.loadingClients = true;
    this.cdr.markForCheck();

    let obs$;
    switch (this.optionsMode) {
      case 'ADMIN': obs$ = this.opts.adminClients(); break;
      case 'CRM': obs$ = this.opts.crmClients(); break;
      case 'PAYDEK': obs$ = this.opts.paydekClients(); break;
      case 'AUDITOR': obs$ = this.opts.auditorClients(); break;
      case 'CEO':
      case 'CCO': obs$ = this.opts.ceoClients(); break;
      default: obs$ = of([] as ClientOption[]);
    }

    obs$.subscribe({
      next: (list: ClientOption[]) => {
        this.clients = list || [];
        if (!this.state.clientId && this.clients.length) {
          this.state.clientId = this.clients[0].id;
        }
        this.loadingClients = false;
        this.loadBranches();
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingClients = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadBranches(): void {
    // BranchDesk: locked to self
    if (this.optionsMode === 'BRANCH') {
      this.loadingBranches = true;
      this.cdr.markForCheck();
      this.opts.branchSelf().subscribe({
        next: b => {
          this.branches = [b];
          this.state.branchId = b.id;
          this.loadingBranches = false;
          this.persistAndEmit();
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingBranches = false;
          this.cdr.markForCheck();
        },
      });
      return;
    }

    // CLIENT portal: load own branches (no clientId needed)
    if (this.optionsMode === 'CLIENT') {
      this.loadingBranches = true;
      this.cdr.markForCheck();
      this.opts.clientBranches().subscribe({
        next: list => {
          this.branches = list || [];
          if (this.state.branchId && !this.branches.some(b => b.id === this.state.branchId)) {
            this.state.branchId = undefined;
          }
          this.loadingBranches = false;
          this.persistAndEmit();
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingBranches = false;
          this.cdr.markForCheck();
        },
      });
      return;
    }

    // ADMIN/CRM/PAYDEK/AUDITOR/CEO/CCO: load by clientId
    if (this.showBranch) {
      if (!this.state.clientId && this.showClient) {
        this.persistAndEmit();
        return;
      }

      this.loadingBranches = true;
      this.cdr.markForCheck();

      let obs$;
      switch (this.optionsMode) {
        case 'ADMIN': obs$ = this.opts.adminBranches(this.state.clientId!); break;
        case 'CRM': obs$ = this.opts.crmBranches(this.state.clientId!); break;
        case 'PAYDEK': obs$ = this.opts.paydekBranches(this.state.clientId!); break;
        case 'AUDITOR': obs$ = this.opts.auditorBranches(this.state.clientId!); break;
        case 'CEO':
        case 'CCO': obs$ = this.opts.ceoBranches(this.state.clientId!); break;
        default: obs$ = of([] as BranchOption[]);
      }

      obs$.subscribe({
        next: list => {
          this.branches = list || [];
          if (this.state.branchId && !this.branches.some(b => b.id === this.state.branchId)) {
            this.state.branchId = undefined;
          }
          this.loadingBranches = false;
          this.persistAndEmit();
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingBranches = false;
          this.cdr.markForCheck();
        },
      });
    } else {
      this.persistAndEmit();
    }
  }

  private persistAndEmit(): void {
    this.ctx.set(this.contextKey, this.state);
    this.changed.emit({ ...this.state });
  }
}
