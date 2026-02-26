import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { ComplianceTrendComponent } from './compliance-trend.component';
import { RiskForecastComponent } from './risk-forecast.component';
import { ComplianceSummaryComponent } from './compliance-summary.component';
import { RiskSimulatorComponent } from './risk-simulator.component';

type ModuleType = 'ALL' | 'RETURNS' | 'MCD' | 'REGISTRATION';

@Component({
  standalone: true,
  selector: 'app-branch-compliance',
  imports: [CommonModule, FormsModule, ComplianceTrendComponent, RiskForecastComponent, ComplianceSummaryComponent, RiskSimulatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './branch-compliance.component.html',
  styles: [`
    .page{max-width:1280px;margin:0 auto;}
    .head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
    .title{font-size:18px;font-weight:800;margin:0;color:#0f172a;}
    .sub{margin-top:4px;color:#64748b;font-size:12px;}
    .controls{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;}
    input,select{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff;font-size:13px;}
    .cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:12px 0;}
    .card{background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
    .k{color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
    .v{margin-top:8px;font-size:20px;font-weight:900;color:#0f172a;}
    .tbl{background:#fff;border:1px solid #f1f5f9;border-radius:16px;overflow:hidden;}
    table{width:100%;border-collapse:collapse;}
    th{background:#f8fafc;border-bottom:2px solid #f1f5f9;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:12px 14px;text-align:left;}
    td{border-bottom:1px solid #f8fafc;padding:12px 14px;font-size:13px;color:#0f172a;vertical-align:top;}
    .badge{display:inline-flex;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px;}
    .LOW{background:#dcfce7;color:#166534;}
    .MEDIUM{background:#fef3c7;color:#92400e;}
    .HIGH{background:#fee2e2;color:#991b1b;}
    .CRITICAL{background:#fecaca;color:#7f1d1d;outline:2px solid rgba(220,38,38,.35);}
    .INFO{background:#e0f2fe;color:#075985;}
    .btn{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#0f172a;color:#fff;cursor:pointer;font-weight:800;font-size:12px;}
    .btn2{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#fff;color:#0f172a;cursor:pointer;font-weight:800;font-size:12px;}
    .muted{color:#94a3b8;font-size:12px;}
    @media(max-width:900px){.cards{grid-template-columns:repeat(2,minmax(0,1fr));}}
  `]
})
export class BranchComplianceComponent implements OnInit {
  month = this.toYYYYMM(new Date());
  module: ModuleType = 'ALL';

  branches: any[] = [];
  branchId = '';

  loading = false;
  stateCode: string | null = null;
  establishmentType: string | null = null;

  items: any[] = [];

  // KPI
  total = 0;
  returnsCount = 0;
  mcdCount = 0;
  highCritical = 0;

  // Upload completion %
  completionPercent = 0;
  uploaded = 0;
  totalApplicableCodes = 0;

  // Risk score
  riskScore = 0;
  riskLevel = 'LOW';
  inspectionProbability = 0;
  riskReasons: string[] = [];

  // Action plan
  actionPlan: any[] = [];
  actionPlanLoading = false;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const mapped = this.auth.getBranchIds();
    if (mapped?.length) {
      this.branchId = mapped[0];
      this.branches = [{ id: mapped[0], name: 'My Branch' }];
      this.load();
      return;
    }

    // Master/CRM/Client: show all branches
    this.api.list().subscribe({
      next: (b: any[]) => {
        this.branches = (b || []).map(x => ({ id: x.id, name: x.name || x.branchName || x.title || 'Branch' }));
        this.branchId = this.branches[0]?.id || '';
        this.cdr.markForCheck();
        this.load();
      }
    });
  }

  load() {
    if (!this.branchId) return;

    this.loading = true;
    this.cdr.markForCheck();

    this.api.getBranchComplianceItems(this.branchId, this.month).subscribe({
      next: (res: any) => {
        this.stateCode = res.stateCode ?? null;
        this.establishmentType = res.establishmentType ?? null;

        const all = res.items || [];
        this.items = this.module === 'ALL' ? all : all.filter((x: any) => x.module === this.module);

        this.computeKpi(all);
        this.loadCompletion();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.items = [];
        this.computeKpi([]);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // Navigate to unified Monthly Uploads page
  upload(it: any) {
    // Determine correct portal prefix
    const prefix = this.auth.getBranchIds()?.length ? '/branch' : '/client';
    this.router.navigate([`${prefix}/monthly-uploads`], {
      queryParams: {
        branchId: this.branchId,
        month: this.month,
        module: it.module,
        code: it.code,
      },
    });
  }

  private loadCompletion() {
    this.api.getComplianceCompletion(this.month, this.branchId).subscribe({
      next: (res: any) => {
        const row = res?.items?.[0];
        if (row) {
          this.completionPercent = row.completionPercent ?? 0;
          this.uploaded = row.uploaded ?? 0;
          this.totalApplicableCodes = row.totalApplicableCodes ?? 0;
        } else {
          this.completionPercent = 0;
          this.uploaded = 0;
          this.totalApplicableCodes = 0;
        }
        this.cdr.markForCheck();
        this.loadRiskScore();
      },
      error: () => {
        this.completionPercent = 0;
        this.uploaded = 0;
        this.totalApplicableCodes = 0;
        this.cdr.markForCheck();
      }
    });
  }

  private loadRiskScore() {
    if (!this.branchId) return;
    this.api.getRiskScore(this.month, this.branchId).subscribe({
      next: (res: any) => {
        const row = (res?.items || [])[0];
        this.riskScore = row?.riskScore ?? 0;
        this.riskLevel = row?.riskLevel ?? 'LOW';
        this.inspectionProbability = row?.inspectionProbability ?? 0;
        this.riskReasons = row?.reasons || [];
        this.cdr.markForCheck();
        this.loadActionPlan();
      },
      error: () => {
        this.riskScore = 0;
        this.riskLevel = 'LOW';
        this.inspectionProbability = 0;
        this.riskReasons = [];
        this.cdr.markForCheck();
      }
    });
  }

  private loadActionPlan() {
    if (!this.branchId) return;
    this.actionPlanLoading = true;
    this.cdr.markForCheck();

    this.api.getActionPlan(this.month, this.branchId).subscribe({
      next: (res: any) => {
        this.actionPlan = res?.actions || [];
        this.actionPlanLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.actionPlan = [];
        this.actionPlanLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private computeKpi(all: any[]) {
    this.total = all.length;
    this.returnsCount = all.filter(x => x.module === 'RETURNS').length;
    this.mcdCount = all.filter(x => x.module === 'MCD').length;
    this.highCritical = all.filter(x => x.priority === 'HIGH' || x.priority === 'CRITICAL').length;
  }

  badgeClass(p: string) {
    return `badge ${p}`;
  }

  private toYYYYMM(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
}
