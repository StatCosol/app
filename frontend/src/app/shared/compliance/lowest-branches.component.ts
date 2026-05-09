import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  standalone: true,
  selector: 'app-lowest-branches',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lb-card">
      <div class="lb-head">
        <h3 class="lb-title">Lowest Branch Compliance</h3>
        <input autocomplete="off" id="lb-month" name="month" type="month" [(ngModel)]="month" (change)="load()" class="lb-month" />
      </div>

      <div *ngIf="loading" class="lb-muted" style="padding:12px 0;">Loading…</div>

      <table *ngIf="!loading && rows.length" class="lb-tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Branch</th>
            <th>State</th>
            <th>Completion</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of rows; let i = index">
            <td>{{ i + 1 }}</td>
            <td style="font-weight:700;">{{ r.branchName }}</td>
            <td>{{ r.stateCode || '—' }}</td>
            <td>
              <span class="lb-pct" [style.color]="r.completionPercent < 50 ? '#dc2626' : r.completionPercent < 80 ? '#d97706' : '#16a34a'">
                {{ r.completionPercent }}%
              </span>
            </td>
            <td class="lb-muted">{{ r.uploaded }}/{{ r.totalApplicable }}</td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="!loading && !rows.length" class="lb-muted" style="padding:16px 0;text-align:center;">
        No branch data available
      </div>
    </div>
  `,
  styles: [`
    .lb-card{background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);margin-top:16px;}
    .lb-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
    .lb-title{font-size:15px;font-weight:800;color:#0f172a;margin:0;}
    .lb-month{border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;background:#fff;}
    .lb-tbl{width:100%;border-collapse:collapse;}
    .lb-tbl th{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;text-align:left;border-bottom:2px solid #f1f5f9;background:#f8fafc;}
    .lb-tbl td{padding:8px 10px;font-size:13px;color:#0f172a;border-bottom:1px solid #f8fafc;}
    .lb-pct{font-weight:900;font-size:14px;}
    .lb-muted{color:#94a3b8;font-size:12px;}
  `]
})
export class LowestBranchesComponent implements OnInit {
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

    this.api.getLowestBranches(this.month).subscribe({
      next: (res: any) => {
        this.rows = res?.items || [];
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
}
