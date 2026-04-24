import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-compliance-charts',
  imports: [CommonModule],
  template: `
    <div class="charts-grid">
      <div class="chart-card">
        <h3>Returns by Status</h3>
        <div class="bar-row" *ngFor="let row of returnStatusRows">
          <div class="label">{{ row.label }}</div>
          <div class="bar-wrap">
            <div class="bar" [style.width.%]="(row.count / getMax(returnStatusRows)) * 100"></div>
          </div>
          <div class="count">{{ row.count }}</div>
        </div>
        <div *ngIf="!returnStatusRows.length" class="empty">No returns data</div>
      </div>

      <div class="chart-card">
        <h3>Renewals by Status</h3>
        <div class="bar-row" *ngFor="let row of expiryStatusRows">
          <div class="label">{{ row.label }}</div>
          <div class="bar-wrap">
            <div class="bar" [style.width.%]="(row.count / getMax(expiryStatusRows)) * 100"></div>
          </div>
          <div class="count">{{ row.count }}</div>
        </div>
        <div *ngIf="!expiryStatusRows.length" class="empty">No renewals data</div>
      </div>
    </div>
  `,
  styles: [
    `
      .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
        gap: 16px;
      }
      .chart-card {
        border: 1px solid #e5e5e5;
        border-radius: 10px;
        padding: 16px;
        background: #fff;
      }
      .chart-card h3 {
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 600;
      }
      .bar-row {
        display: grid;
        grid-template-columns: 180px 1fr 40px;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }
      .label {
        font-size: 13px;
      }
      .bar-wrap {
        height: 14px;
        border-radius: 10px;
        background: #f0f0f0;
        overflow: hidden;
      }
      .bar {
        height: 100%;
        background: #6366f1;
        border-radius: 10px;
        transition: width 0.3s ease;
      }
      .count {
        text-align: right;
        font-weight: 600;
        font-size: 13px;
      }
      .empty {
        color: #666;
        padding: 10px 0;
        font-size: 13px;
      }
    `,
  ],
})
export class ComplianceChartsComponent implements OnChanges {
  @Input() returnTasks: any[] = [];
  @Input() expiryTasks: any[] = [];

  returnStatusRows: { label: string; count: number }[] = [];
  expiryStatusRows: { label: string; count: number }[] = [];

  ngOnChanges(): void {
    this.returnStatusRows = this.buildRows(this.returnTasks.map((x) => x.status));
    this.expiryStatusRows = this.buildRows(this.expiryTasks.map((x) => x.status));
  }

  getMax(rows: { label: string; count: number }[]): number {
    return Math.max(...rows.map((r) => r.count), 1);
  }

  private buildRows(items: string[]): { label: string; count: number }[] {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item, (map.get(item) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }
}
