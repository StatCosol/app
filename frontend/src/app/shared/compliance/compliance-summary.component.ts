import { Component, Input, OnChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  standalone: true,
  selector: 'app-compliance-summary',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="card">
    <div class="k">AI Compliance Summary</div>

    <div *ngIf="loading" class="muted">Generating summary...</div>

    <div *ngIf="!loading && summary">
      <div style="margin-top:10px;font-size:13px;color:#0f172a;line-height:1.5;">
        {{ summary.summary }}
      </div>
    </div>
  </div>
  `
})
export class ComplianceSummaryComponent implements OnChanges {
  @Input() branchId!: string;
  @Input() month!: string;

  loading = false;
  summary: any;

  constructor(private api: ClientBranchesService, private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    if (!this.branchId || !this.month) return;
    this.load();
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getComplianceSummary(this.month, this.branchId).subscribe({
      next: (res: any) => {
        this.summary = res;
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
