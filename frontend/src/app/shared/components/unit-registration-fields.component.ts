import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CrmUnitDocumentsApi } from '../../core/api/crm-unit-documents.api';

export interface UnitRegistrationDetails {
  registrationId: string;
  registrationType: string;
  registrationNumber: string;
  authority: string;
  noExpiry: boolean;
}
export const emptyRegistration = (): UnitRegistrationDetails => ({ registrationId: '', registrationType: '', registrationNumber: '', authority: '', noExpiry: false });
export const tracksRegistration = (type: string): boolean => ['registration', 'licence', 'license', 'renewal'].includes(type.toLowerCase());
export function registrationUploadError(details: UnitRegistrationDetails, type: string, branchId: string, expiry: string, files: number): string | null {
  if (!tracksRegistration(type)) return null;
  if (!branchId) return 'Select a branch for expiry tracking.';
  if (files !== 1) return 'Upload one registration or renewal file at a time.';
  if (!details.noExpiry && !expiry) return 'Enter the expiry date or select No expiry.';
  if (type.toLowerCase() === 'renewal' && !details.registrationId) return 'Select the registration being renewed.';
  if (type.toLowerCase() !== 'renewal' && !details.registrationType.trim()) return 'Enter the registration or licence name.';
  return null;
}
export function appendRegistration(form: FormData, details: UnitRegistrationDetails, type: string): void {
  if (!tracksRegistration(type)) return;
  for (const key of ['registrationId', 'registrationType', 'registrationNumber', 'authority'] as const) {
    if (details[key].trim()) form.append(key, details[key].trim());
  }
  if (details.noExpiry) form.append('noExpiry', 'true');
}

@Component({
  selector: 'app-unit-registration-fields', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    @if (tracked) {
      <section class="rounded border bg-slate-50 p-3 my-3">
        <p class="text-sm mb-2">This upload updates the branch registration and expiry register.</p>
        @if (type.toLowerCase() === 'renewal') {
          <label class="block text-sm">Registration to renew
            <select class="border rounded p-2 w-full" aria-label="Registration to renew" [(ngModel)]="details.registrationId" [ngModelOptions]="{standalone: true}" (ngModelChange)="emit()">
              <option value="">{{ loading ? 'Loading registrations…' : 'Select registration' }}</option>
              @for (record of options; track record.id) {
                <option [value]="record.id">{{ record.type }} {{ record.registrationNumber || '' }} — {{ record.expiryDate || 'No expiry' }}</option>
              }
            </select>
          </label>
          @if (error) { <p role="alert" class="text-sm text-red-700">{{ error }}</p> }
          @if (!loading && !error && branchId && !options.length) { <p class="text-sm">No registrations found. Upload the original registration or licence first.</p> }
        } @else {
          <div class="grid sm:grid-cols-3 gap-3">
            <label class="text-sm">Registration / licence name *<input class="border rounded p-2 w-full" aria-label="Registration name" maxlength="200" [(ngModel)]="details.registrationType" [ngModelOptions]="{standalone: true}" (ngModelChange)="emit()" placeholder="e.g. Pollution consent"></label>
            <label class="text-sm">Registration number<input class="border rounded p-2 w-full" aria-label="Registration number" maxlength="100" [(ngModel)]="details.registrationNumber" [ngModelOptions]="{standalone: true}" (ngModelChange)="emit()"></label>
            <label class="text-sm">Issuing authority<input class="border rounded p-2 w-full" aria-label="Issuing authority" maxlength="200" [(ngModel)]="details.authority" [ngModelOptions]="{standalone: true}" (ngModelChange)="emit()"></label>
          </div>
        }
        <label class="block mt-3 text-sm"><input type="checkbox" aria-label="No expiry" [(ngModel)]="details.noExpiry" [ngModelOptions]="{standalone: true}" (ngModelChange)="emit()"> No expiry date (permanent registration)</label>
      </section>
    }
  `,
})
export class UnitRegistrationFieldsComponent implements OnChanges, OnDestroy {
  @Input() portal: 'branch' | 'crm' = 'branch';
  @Input() clientId = '';
  @Input() branchId = '';
  @Input() type = '';
  @Output() detailsChange = new EventEmitter<UnitRegistrationDetails>();
  details = emptyRegistration();
  options: Array<{id: string; type: string; registrationNumber: string | null; expiryDate: string | null}> = [];
  loading = false;
  error = '';
  private request?: Subscription;
  constructor(private readonly api: CrmUnitDocumentsApi, private readonly cdr: ChangeDetectorRef) {}
  get tracked(): boolean { return tracksRegistration(this.type); }
  ngOnChanges(): void {
    this.request?.unsubscribe(); this.details = emptyRegistration(); this.options = []; this.error = ''; this.loading = false; this.emit();
    if (this.type.toLowerCase() !== 'renewal' || !this.branchId || !this.clientId) return;
    this.loading = true;
    this.request = this.api.registrationOptions(this.portal, this.clientId, this.branchId).subscribe({
      next: rows => { this.options = rows; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'Unable to load registrations. Select the branch again to retry.'; this.loading = false; this.cdr.markForCheck(); },
    });
  }
  emit(): void { this.detailsChange.emit({...this.details}); }
  ngOnDestroy(): void { this.request?.unsubscribe(); }
}
