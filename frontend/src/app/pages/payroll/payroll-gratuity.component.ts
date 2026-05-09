import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  FormInputComponent,
} from '../../shared/ui';

interface GratuityResult {
  eligible: boolean;
  reason?: string;
  grossGratuity: number;
  cappedGratuity: number;
  yearsConsidered: number;
  formula: string;
}

@Component({
  selector: 'app-payroll-gratuity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    FormInputComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Gratuity Calculator"
        description="Calculate gratuity under the Payment of Gratuity Act, 1972"
        icon="calculator">
      </ui-page-header>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Input -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Enter Details</h3>
          <div class="space-y-4">
            <ui-form-input label="Last Drawn Monthly Salary (Basic + DA) ₹ *" type="number"
              [(ngModel)]="input.lastDrawnSalary" placeholder="e.g. 50000"></ui-form-input>
            <ui-form-input label="Completed Years of Service *" type="number"
              [(ngModel)]="input.yearsOfService" placeholder="e.g. 7"></ui-form-input>
            <ui-form-input label="Additional Months (partial year)" type="number"
              [(ngModel)]="input.monthsOfService" placeholder="0-11"></ui-form-input>
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input autocomplete="off" id="pg-is-death-or-disability" name="isDeathOrDisability" type="checkbox" [(ngModel)]="input.isDeathOrDisability"
                class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Death or disability (waives 5-year minimum)
            </label>

            <ui-button variant="primary" [disabled]="calculating" (clicked)="calculate()">
              {{ calculating ? 'Calculating...' : 'Calculate Gratuity' }}
            </ui-button>

            <div *ngIf="error" class="text-sm text-red-600">{{ error }}</div>
          </div>
        </div>

        <!-- Result -->
        <div *ngIf="result" class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Result</h3>

          <!-- Eligibility -->
          <div class="mb-4 p-3 rounded-lg"
               [class.bg-green-50]="result.eligible"
               [class.border-green-200]="result.eligible"
               [class.bg-red-50]="!result.eligible"
               [class.border-red-200]="!result.eligible"
               [class.border]="true">
            <div class="flex items-center gap-2">
              <span class="text-lg" [class.text-green-700]="result.eligible" [class.text-red-700]="!result.eligible">
                {{ result.eligible ? '✓ Eligible' : '✗ Not Eligible' }}
              </span>
            </div>
            <div *ngIf="result.reason" class="text-sm mt-1 text-red-600">{{ result.reason }}</div>
          </div>

          <div *ngIf="result.eligible" class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Years Considered</span>
              <span class="font-medium">{{ result.yearsConsidered }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Formula</span>
              <span class="font-mono text-xs text-gray-700">{{ result.formula }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Gross Gratuity</span>
              <span class="font-medium">₹{{ fmt(result.grossGratuity) }}</span>
            </div>
            <div *ngIf="result.grossGratuity !== result.cappedGratuity" class="flex justify-between text-sm text-amber-600">
              <span>Maximum Cap Applied (₹25,00,000)</span>
              <span class="font-medium">₹{{ fmt(result.cappedGratuity) }}</span>
            </div>
            <div class="border-t border-gray-200 pt-3 flex justify-between">
              <span class="text-lg font-semibold text-gray-900">Payable Gratuity</span>
              <span class="text-2xl font-bold text-indigo-700">₹{{ fmt(result.cappedGratuity) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Card -->
      <div class="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h4 class="text-sm font-semibold text-blue-800 mb-2">About Gratuity</h4>
        <ul class="text-sm text-blue-700 space-y-1 list-disc pl-5">
          <li>Formula: (15 × Last Drawn Salary × Years of Service) / 26</li>
          <li>"Last Drawn Salary" = Basic Pay + Dearness Allowance</li>
          <li>Minimum 5 years of continuous service required</li>
          <li>Service ≥ 6 months in last year rounds up to next full year</li>
          <li>Maximum gratuity payable: ₹25,00,000</li>
          <li>5-year minimum waived in case of death or disability</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1rem; }
  `],
})
export class PayrollGratuityComponent {
  private base = `${environment.apiBaseUrl}/api/v1/payroll/gratuity`;

  input: any = {
    lastDrawnSalary: null,
    yearsOfService: null,
    monthsOfService: 0,
    isDeathOrDisability: false,
  };

  calculating = false;
  error = '';
  result: GratuityResult | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  calculate(): void {
    if (!this.input.lastDrawnSalary || this.input.lastDrawnSalary <= 0) {
      this.error = 'Last drawn salary is required';
      return;
    }
    if (this.input.yearsOfService == null || this.input.yearsOfService < 0) {
      this.error = 'Years of service is required';
      return;
    }
    this.calculating = true;
    this.error = '';
    this.result = null;
    this.http.post<GratuityResult>(`${this.base}/calculate`, this.input).subscribe({
      next: (res) => {
        this.result = res;
        this.calculating = false;
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.error = e?.error?.message || 'Calculation failed';
        this.calculating = false;
        this.cdr.detectChanges();
      },
    });
  }

  fmt(n: number): string {
    if (n == null) return '0';
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}
