import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CrmContractorsService } from '../../../core/crm-contractors.service';

@Component({
  selector: 'ui-contractor-login-selector',
  standalone: true,
  imports: [FormsModule],
  template: `
    <select
      name="contractorLogin"
      aria-label="Contractor portal login (optional)"
      [ngModel]="value || ''"
      (ngModelChange)="valueChange.emit($event)"
      [disabled]="loading || !clientId"
      class="w-full rounded-lg border-gray-300 text-sm"
    >
      <option value="">{{ loading ? 'Loading logins…' : 'No portal login linked' }}</option>
      @if (value && !hasSelectedLogin()) {
        <option [value]="value">Current linked login — name unavailable</option>
      }
      @for (login of logins; track login.id) {
        <option [value]="login.id">
          {{ login.name || login.email || 'Name unavailable'
          }}{{ login.name && login.email ? ' — ' + login.email : '' }}
        </option>
      }
    </select>
    @if (error) {
      <small
        >Contractor logins could not be loaded.
        <button type="button" (click)="load()">Retry</button></small
      >
    }
  `,
})
export class ContractorLoginSelectorComponent implements OnChanges, OnDestroy {
  @Input() clientId = '';
  @Input() value?: string | null;
  @Output() valueChange = new EventEmitter<string>();
  logins: { id: string; name?: string; email?: string }[] = [];
  loading = false;
  error = false;
  private loadedClient = '';
  private request?: Subscription;
  constructor(
    private readonly api: CrmContractorsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}
  ngOnChanges(): void {
    if (this.loadedClient !== this.clientId) this.load();
  }
  hasSelectedLogin(): boolean {
    return this.logins.some((login) => login.id === this.value);
  }
  load(): void {
    this.request?.unsubscribe();
    this.loadedClient = this.clientId;
    this.logins = [];
    this.loading = !!this.clientId;
    this.error = false;
    if (!this.clientId) return;
    this.request = this.api.listMyContractors(this.clientId).subscribe({
      next: (rows) => {
        this.logins = rows.filter((row: { clientId: string }) => row.clientId === this.clientId);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }
}
