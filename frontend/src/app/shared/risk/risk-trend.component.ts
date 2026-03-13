import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-risk-trend',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './risk-trend.component.html',
  styleUrls: ['./risk-trend.component.scss'],
})
export class RiskTrendComponent implements OnInit {
  branches: any[] = [];
  branchId = '';
  from = '';
  to = '';
  points: any[] = [];
  loading = false;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    this.from = this.toISO(start);
    this.to = this.toISO(now);

    const mapped = this.auth.getBranchIds();
    if (mapped?.length) {
      this.branchId = mapped[0];
      this.branches = mapped.map(id => ({ id, name: 'Branch' }));
      this.load();
      this.api.list().subscribe({
        next: (b: any[]) => {
          const nameMap = new Map((b || []).map((x: any) => [x.id, x.name || x.branchName || x.title || 'Branch']));
          this.branches = mapped.map(id => ({ id, name: nameMap.get(id) || 'Branch' }));
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.api.list().subscribe({
      next: (b: any[]) => {
        this.branches = (b || []).map((x) => ({
          id: x.id,
          name: x.branchName || x.name || x.title || 'Branch',
        }));
        if (this.branches.length) {
          this.branchId = this.branches[0].id;
        }
        this.cdr.markForCheck();
        this.load();
      },
    });
  }

  load(): void {
    if (!this.branchId) return;
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getRiskTrend({ branchId: this.branchId, from: this.from, to: this.to }).subscribe({
      next: (res: any) => {
        this.points = res.points || [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.points = [];
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get maxScore(): number {
    return Math.max(...this.points.map((p) => p.riskScore), 0);
  }

  barHeight(score: number): number {
    const max = this.maxScore || 100;
    return (score / max) * 100;
  }

  barClass(score: number): string {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  private toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
