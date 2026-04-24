import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { EssApiService, StatutoryDetails, ContributionRow } from '../ess-api.service';

@Component({
  selector: 'app-ess-esi',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-5xl mx-auto space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">My ESI Details</h1>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading...</div>

      <!-- ESI Identity Card -->
      <div *ngIf="!loading && statutory" class="info-card">
        <h2 class="card-title">ESI Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">ESI IP Number</span>
            <span class="info-value highlight">{{ statutory.esi.ipNumber || 'Not assigned' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Dispensary</span>
            <span class="info-value highlight">{{ statutory.esi.dispensary || 'Not assigned' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">ESI Join Date</span>
            <span class="info-value">{{ statutory.esi.joinDate || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">ESI Exit Date</span>
            <span class="info-value">{{ statutory.esi.exitDate || 'Active' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">ESI Applicable</span>
            <span class="info-value">
              <span class="status-badge" [class.active]="statutory.esi.applicable">
                {{ statutory.esi.applicable ? 'Yes' : 'No' }}
              </span>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">ESI Registered</span>
            <span class="info-value">
              <span class="status-badge" [class.active]="statutory.esi.registered">
                {{ statutory.esi.registered ? 'Yes' : 'No' }}
              </span>
            </span>
          </div>
          <div *ngIf="statutory.esi.wages" class="info-item">
            <span class="info-label">ESI Wages</span>
            <span class="info-value">₹{{ statutory.esi.wages }}</span>
          </div>
        </div>
      </div>

      <!-- Monthly ESI Contributions -->
      <div *ngIf="!loading" class="info-card">
        <h2 class="card-title">Monthly ESI Contributions</h2>

        <div *ngIf="!esiContributions.length" class="text-gray-500 text-sm py-4">
          No contribution data found for the selected period.
        </div>

        <div *ngIf="esiContributions.length" class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th class="text-right">Gross Wages</th>
                <th class="text-right">Employee ESI (0.75%)</th>
                <th class="text-right">Employer ESI (3.25%)</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of esiContributions">
                <td class="font-medium">{{ monthName(c.periodMonth) }} {{ c.periodYear }}</td>
                <td class="text-right">₹{{ c.grossEarnings }}</td>
                <td class="text-right">₹{{ c.esiEmployee }}</td>
                <td class="text-right">₹{{ c.esiEmployer }}</td>
                <td class="text-right font-semibold">₹{{ esiTotal(c) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="font-bold border-t-2 border-gray-300">
                <td>Total</td>
                <td class="text-right">₹{{ sumField('grossEarnings') }}</td>
                <td class="text-right">₹{{ sumField('esiEmployee') }}</td>
                <td class="text-right">₹{{ sumField('esiEmployer') }}</td>
                <td class="text-right">₹{{ grandEsiTotal() }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .info-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .info-item { display: flex; flex-direction: column; gap: 2px; }
    .info-label { font-size: 12px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-value { font-size: 15px; color: #111827; }
    .info-value.highlight { font-weight: 700; color: #059669; font-size: 16px; }

    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: #fee2e2;
      color: #b91c1c;
    }
    .status-badge.active { background: #dcfce7; color: #15803d; }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .data-table th {
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
      color: #6b7280;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid #e5e7eb;
    }
    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f3f4f6;
      color: #111827;
    }
    .data-table tfoot td {
      padding: 12px;
      border-top: 2px solid #d1d5db;
    }
  `],
})
export class EssEsiComponent implements OnInit, OnDestroy {
  loading = false;
  private readonly destroy$ = new Subject<void>();
  statutory: StatutoryDetails | null = null;
  esiContributions: ContributionRow[] = [];

  private months = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    forkJoin({
      statutory: this.api.getStatutory(),
      contributions: this.api.getContributions(),
    })
    .pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    )
    .subscribe({
      next: (data) => {
        this.loading = false;
        this.statutory = data.statutory;
        this.esiContributions = data.contributions;
      },
      error: () => {
        this.loading = false;
        this.statutory = null;
        this.esiContributions = [];
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  monthName(m: number): string { return this.months[m] || String(m); }

  esiTotal(c: ContributionRow): string {
    return (parseFloat(c.esiEmployee) + parseFloat(c.esiEmployer)).toFixed(2);
  }

  sumField(field: keyof ContributionRow): string {
    return this.esiContributions
      .reduce((sum, c) => sum + parseFloat(String(c[field]) || '0'), 0)
      .toFixed(2);
  }

  grandEsiTotal(): string {
    return this.esiContributions
      .reduce((sum, c) => sum + parseFloat(c.esiEmployee) + parseFloat(c.esiEmployer), 0)
      .toFixed(2);
  }
}
