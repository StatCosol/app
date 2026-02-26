import { Component, Input, OnChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  standalone: true,
  selector: 'app-risk-forecast',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="card">
    <div class="k">Next Month Forecast</div>

    <div *ngIf="loading" class="muted">Calculating forecast...</div>

    <div *ngIf="!loading && forecast">
      <div class="v">{{ forecast.forecastInspectionProbability }}%</div>
      <div class="muted">
        Expected inspection probability for {{ forecast.nextMonth }}
      </div>

      <div style="margin-top:10px;font-size:12px;color:#64748b;">
        Trend slope: {{ forecast.drivers.trendSlope }}% |
        Overdue SLA: {{ forecast.drivers.overdueSla }} |
        Expiring Reg: {{ forecast.drivers.expiringRegistrations ? 'Yes' : 'No' }}
      </div>
    </div>
  </div>
  `
})
export class RiskForecastComponent implements OnChanges {
  @Input() branchId!: string;

  loading = false;
  forecast: any;

  constructor(private api: ClientBranchesService, private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    if (!this.branchId) return;
    this.load();
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getRiskForecast(this.branchId).subscribe({
      next: (res: any) => {
        this.forecast = res;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }
}
