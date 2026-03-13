import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  FormInputComponent,
} from '../../shared/ui';

interface SlabRow { slab: string; rate: number; tax: number; }

interface TdsResult {
  regime: string;
  annualGross: number;
  standardDeduction: number;
  totalExemptions: number;
  taxableIncome: number;
  taxBeforeCess: number;
  cess: number;
  totalTaxLiability: number;
  rebate87A: number;
  netTaxAfterRebate: number;
  tdsAlreadyPaid: number;
  balanceTax: number;
  monthlyTds: number;
  slabBreakdown: SlabRow[];
}

interface CompareResult {
  old: TdsResult;
  new: TdsResult;
  recommended: string;
  savings: number;
}

@Component({
  selector: 'app-payroll-tds',
  standalone: true,
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
        title="TDS Calculator"
        description="Calculate Income Tax (TDS) under Old & New regimes"
        icon="calculator">
      </ui-page-header>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Input Form -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Enter Details</h3>
          <div class="space-y-4">
            <ui-form-input label="Annual Gross Salary (₹) *" type="number" [(ngModel)]="input.annualGross" placeholder="e.g. 1200000"></ui-form-input>

            <div class="border-t border-gray-100 pt-4">
              <h4 class="text-sm font-semibold text-gray-700 mb-3">Old Regime Deductions</h4>
              <div class="grid grid-cols-2 gap-3">
                <ui-form-input label="80C (₹)" type="number" [(ngModel)]="input.deduction80C" placeholder="Max 1,50,000"></ui-form-input>
                <ui-form-input label="80D Medical (₹)" type="number" [(ngModel)]="input.deduction80D" placeholder="Max 1,00,000"></ui-form-input>
                <ui-form-input label="24b Home Loan (₹)" type="number" [(ngModel)]="input.deduction24b" placeholder="Max 2,00,000"></ui-form-input>
                <ui-form-input label="HRA Exemption (₹)" type="number" [(ngModel)]="input.hraExemption" placeholder="0"></ui-form-input>
                <ui-form-input label="Other Deductions (₹)" type="number" [(ngModel)]="input.otherDeductions" placeholder="0"></ui-form-input>
              </div>
            </div>

            <div class="border-t border-gray-100 pt-4">
              <div class="grid grid-cols-2 gap-3">
                <ui-form-input label="TDS Already Paid (₹)" type="number" [(ngModel)]="input.tdsAlreadyPaid" placeholder="0"></ui-form-input>
                <ui-form-input label="Remaining Months" type="number" [(ngModel)]="input.remainingMonths" placeholder="12"></ui-form-input>
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <ui-button variant="primary" [disabled]="calculating" (clicked)="compareBoth()">
                {{ calculating ? 'Calculating...' : 'Compare Both Regimes' }}
              </ui-button>
            </div>

            <div *ngIf="error" class="text-sm text-red-600">{{ error }}</div>
          </div>
        </div>

        <!-- Results -->
        <div *ngIf="result" class="space-y-4">
          <!-- Recommendation Banner -->
          <div class="rounded-xl p-4 border-2"
               [class.border-green-400]="result.recommended === 'NEW'"
               [class.bg-green-50]="result.recommended === 'NEW'"
               [class.border-amber-400]="result.recommended === 'OLD'"
               [class.bg-amber-50]="result.recommended === 'OLD'">
            <div class="text-lg font-bold" [class.text-green-800]="result.recommended === 'NEW'" [class.text-amber-800]="result.recommended === 'OLD'">
              ✓ {{ result.recommended }} Regime Recommended
            </div>
            <div class="text-sm mt-1" [class.text-green-700]="result.recommended === 'NEW'" [class.text-amber-700]="result.recommended === 'OLD'">
              You save ₹{{ fmt(result.savings) }} annually
            </div>
          </div>

          <!-- Side-by-side comparison -->
          <div class="grid grid-cols-2 gap-4">
            <div *ngFor="let r of [result.new, result.old]"
                 class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                 [class.ring-2]="r.regime === result.recommended"
                 [class.ring-indigo-400]="r.regime === result.recommended">
              <h4 class="text-base font-semibold mb-3" [class.text-indigo-700]="r.regime === 'NEW'" [class.text-amber-700]="r.regime === 'OLD'">
                {{ r.regime }} Regime
                <span *ngIf="r.regime === result.recommended" class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full ml-1">Best</span>
              </h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-gray-600">Gross Salary</span><span class="font-medium">₹{{ fmt(r.annualGross) }}</span></div>
                <div class="flex justify-between"><span class="text-gray-600">Std. Deduction</span><span>₹{{ fmt(r.standardDeduction) }}</span></div>
                <div *ngIf="r.totalExemptions > 0" class="flex justify-between"><span class="text-gray-600">Exemptions</span><span>₹{{ fmt(r.totalExemptions) }}</span></div>
                <div class="flex justify-between border-t pt-1"><span class="text-gray-700 font-medium">Taxable Income</span><span class="font-semibold">₹{{ fmt(r.taxableIncome) }}</span></div>

                <!-- Slab breakdown -->
                <div class="mt-2">
                  <div *ngFor="let s of r.slabBreakdown" class="flex justify-between text-xs text-gray-500 py-0.5">
                    <span>{{ s.slab }} &#64; {{ s.rate }}%</span><span>₹{{ fmt(s.tax) }}</span>
                  </div>
                </div>

                <div class="flex justify-between"><span class="text-gray-600">Tax Before Cess</span><span>₹{{ fmt(r.taxBeforeCess) }}</span></div>
                <div *ngIf="r.rebate87A > 0" class="flex justify-between text-green-600"><span>Rebate 87A</span><span>-₹{{ fmt(r.rebate87A) }}</span></div>
                <div class="flex justify-between"><span class="text-gray-600">Cess (4%)</span><span>₹{{ fmt(r.cess) }}</span></div>
                <div class="flex justify-between border-t pt-1 border-gray-200">
                  <span class="font-semibold text-gray-900">Total Tax</span>
                  <span class="font-bold text-gray-900">₹{{ fmt(r.totalTaxLiability) }}</span>
                </div>
                <div *ngIf="r.tdsAlreadyPaid > 0" class="flex justify-between"><span class="text-gray-600">Already Paid</span><span>₹{{ fmt(r.tdsAlreadyPaid) }}</span></div>
                <div class="flex justify-between bg-indigo-50 rounded px-2 py-1 -mx-2">
                  <span class="font-semibold text-indigo-800">Monthly TDS</span>
                  <span class="font-bold text-indigo-900">₹{{ fmt(r.monthlyTds) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1rem; }
  `],
})
export class PayrollTdsComponent {
  private base = `${environment.apiBaseUrl}/api/v1/payroll/tds`;

  input: any = {
    annualGross: null,
    deduction80C: null,
    deduction80D: null,
    deduction24b: null,
    hraExemption: null,
    otherDeductions: null,
    tdsAlreadyPaid: null,
    remainingMonths: 12,
  };

  calculating = false;
  error = '';
  result: CompareResult | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  compareBoth(): void {
    if (!this.input.annualGross || this.input.annualGross <= 0) {
      this.error = 'Annual gross salary is required';
      return;
    }
    this.calculating = true;
    this.error = '';
    this.result = null;
    this.http.post<CompareResult>(`${this.base}/compare`, this.input).subscribe({
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
    return n.toLocaleString('en-IN');
  }
}
