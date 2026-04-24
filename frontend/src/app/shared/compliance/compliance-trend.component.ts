import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  standalone: true,
  selector: 'app-compliance-trend',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div style="background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:14px;margin-top:14px;">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
      <div>
        <div style="font-size:14px;font-weight:900;color:#0f172a;">Completion Trend (Last {{ months }} months)</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Upload completion % (state rules applied)</div>
      </div>
    </div>

    <div *ngIf="loading" style="color:#94a3b8;font-size:12px;padding:10px 0;">Loading…</div>

    <div *ngIf="!loading">
      <svg *ngIf="rows.length>0" [attr.width]="width" [attr.height]="height" style="margin-top:12px;">
        <!-- axes baseline -->
        <line x1="20" [attr.y1]="height-30" [attr.x2]="width-10" [attr.y2]="height-30" stroke="#e2e8f0" stroke-width="2"></line>

        <!-- bars -->
        <ng-container *ngFor="let r of rows; let i = index">
          <rect
            [attr.x]="barX(i)"
            [attr.y]="barY(r.completionPercent)"
            [attr.width]="barW"
            [attr.height]="barH(r.completionPercent)"
            fill="#3b82f6"
            rx="6"></rect>

          <text
            [attr.x]="barX(i) + barW/2"
            [attr.y]="height-12"
            text-anchor="middle"
            font-size="10"
            fill="#64748b">{{ r.month.substring(5) }}</text>

          <text
            [attr.x]="barX(i) + barW/2"
            [attr.y]="barY(r.completionPercent) - 6"
            text-anchor="middle"
            font-size="10"
            fill="#0f172a">{{ r.completionPercent }}%</text>
        </ng-container>
      </svg>

      <div *ngIf="rows.length===0" style="color:#94a3b8;font-size:12px;padding:14px;text-align:center;">No trend data</div>
    </div>
  </div>
  `
})
export class ComplianceTrendComponent implements OnChanges {
  @Input() branchId = '';
  @Input() months = 6;

  loading = false;
  rows: any[] = [];

  width = 720;
  height = 220;

  barW = 60;
  gap = 18;

  constructor(private api: ClientBranchesService, private cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (!this.branchId) return;
    this.load();
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getComplianceCompletionTrend(this.branchId, this.months).subscribe({
      next: (res: any) => {
        this.rows = res.items || [];
        const count = Math.max(this.rows.length, 1);
        this.width = Math.max(520, 20 + count * (this.barW + this.gap));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.rows = [];
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  barX(i: number) {
    return 20 + i * (this.barW + this.gap);
  }

  barY(p: number) {
    const base = this.height - 30;
    const maxH = 140;
    return base - (Math.max(0, Math.min(100, p)) / 100) * maxH;
  }

  barH(p: number) {
    const base = this.height - 30;
    return base - this.barY(p);
  }
}
