import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  standalone: true,
  selector: 'app-risk-ranking',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rr-card">
      <div class="rr-head">
        <h3 class="rr-title">Highest Risk Branches</h3>
        <input autocomplete="off" id="rr-month" name="month" type="month" [(ngModel)]="month" (change)="load()" class="rr-month" />
      </div>

      <div *ngIf="loading" class="rr-muted" style="padding:12px 0;">Loading…</div>

      <table *ngIf="!loading && rows.length" class="rr-tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Branch</th>
            <th>State</th>
            <th>Probability</th>
            <th>Level</th>
            <th>Top Risk Factor</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of rows; let i = index">
            <td>{{ i + 1 }}</td>
            <td style="font-weight:700;">{{ r.branchName }}</td>
            <td>{{ r.stateCode || '—' }}</td>
            <td>
              <span class="rr-pct" [style.color]="probColor(r.inspectionProbability)">
                {{ r.inspectionProbability }}%
              </span>
            </td>
            <td>
              <span class="rr-badge" [ngClass]="r.riskLevel">{{ r.riskLevel }}</span>
            </td>
            <td class="rr-muted">{{ r.reasons?.[0] || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="!loading && !rows.length" class="rr-muted" style="padding:16px 0;text-align:center;">
        No branch risk data available
      </div>
    </div>
  `,
  styles: [`
    .rr-card{background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);margin-top:16px;}
    .rr-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
    .rr-title{font-size:15px;font-weight:800;color:#0f172a;margin:0;}
    .rr-month{border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;background:#fff;}
    .rr-tbl{width:100%;border-collapse:collapse;}
    .rr-tbl th{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;text-align:left;border-bottom:2px solid #f1f5f9;background:#f8fafc;}
    .rr-tbl td{padding:8px 10px;font-size:13px;color:#0f172a;border-bottom:1px solid #f8fafc;}
    .rr-pct{font-weight:900;font-size:14px;}
    .rr-muted{color:#94a3b8;font-size:12px;}
    .rr-badge{display:inline-flex;padding:3px 8px;border-radius:999px;font-weight:800;font-size:11px;}
    .LOW{background:#dcfce7;color:#166534;}
    .MODERATE{background:#fef3c7;color:#92400e;}
    .HIGH{background:#fee2e2;color:#991b1b;}
    .CRITICAL{background:#fecaca;color:#7f1d1d;outline:2px solid rgba(220,38,38,.35);}
  `]
})
export class RiskRankingComponent implements OnInit {
  month = '';
  rows: any[] = [];
  loading = false;

  constructor(private api: ClientBranchesService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const d = new Date();
    this.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.load();
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getRiskRanking(this.month).subscribe({
      next: (res: any) => {
        this.rows = res?.highestRisk || [];
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

  probColor(p: number): string {
    if (p >= 75) return '#dc2626';
    if (p >= 55) return '#ea580c';
    if (p >= 35) return '#d97706';
    return '#16a34a';
  }
}
