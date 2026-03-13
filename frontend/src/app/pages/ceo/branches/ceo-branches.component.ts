import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { CeoBranchesService } from '../../../core/ceo-branches.service';
import { ReportsService } from '../../../core/reports.service';
import { CeoBranchRow } from '../../../shared/models/ceo-branches.model';
import {
  PageHeaderComponent, StatCardComponent, StatusBadgeComponent,
  LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
  DataTableComponent, TableCellDirective, TableColumn,
} from '../../../shared/ui';

type RiskBandFilter = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH';

@Component({
  selector: 'app-ceo-branches',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    PageHeaderComponent, StatCardComponent, StatusBadgeComponent,
    LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
    DataTableComponent, TableCellDirective,
  ],
  templateUrl: './ceo-branches.component.html',
})
export class CeoBranchesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  month = new Date().toISOString().slice(0, 7);
  q = '';
  stateFilter = 'ALL';
  clientFilter = 'ALL';
  riskBandFilter: RiskBandFilter = 'ALL';
  loading = false;

  sourceBranches: CeoBranchRow[] = [];
  branches: CeoBranchRow[] = [];
  total = 0;
  topRiskBranches: CeoBranchRow[] = [];
  topCompliantBranches: CeoBranchRow[] = [];

  readonly columns: TableColumn[] = [
    { key: 'branchName', header: 'Branch' },
    { key: 'clientName', header: 'Client' },
    { key: 'state', header: 'State' },
    { key: 'compliancePercent', header: 'Compliance %', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', align: 'center' },
    { key: 'auditScore', header: 'Audit Score', align: 'center' },
    { key: 'risk', header: 'Risk', align: 'center' },
    { key: 'action', header: 'Action', align: 'right' },
  ];

  // KPIs computed from response
  kpiTotal = 0;
  kpiHighRisk = 0;
  kpiOverdue = 0;
  kpiAvgCompliance = 0;

  constructor(
    private svc: CeoBranchesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.svc.list(this.month, this.q || undefined).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.sourceBranches = res.items || [];
        this.applyLocalFilters();
        this.cdr.detectChanges();
      },
      error: () => {
        this.sourceBranches = [];
        this.branches = [];
        this.total = 0;
        this.topRiskBranches = [];
        this.topCompliantBranches = [];
        this.computeKpis();
        this.cdr.detectChanges();
      },
    });
  }

  applyLocalFilters(): void {
    this.branches = this.sourceBranches.filter((row) => {
      if (this.stateFilter !== 'ALL' && String(row.state || '') !== this.stateFilter) return false;
      if (this.clientFilter !== 'ALL' && String(row.clientName || '') !== this.clientFilter) return false;
      if (this.riskBandFilter !== 'ALL' && this.riskLabel(row.riskExposureScore) !== this.riskBandFilter) return false;
      return true;
    });

    this.total = this.branches.length;
    this.topRiskBranches = [...this.branches]
      .sort((a, b) => (b.riskExposureScore || 0) - (a.riskExposureScore || 0))
      .slice(0, 5);
    this.topCompliantBranches = [...this.branches]
      .sort((a, b) => (b.compliancePercent || 0) - (a.compliancePercent || 0))
      .slice(0, 5);
    this.computeKpis();
    this.cdr.markForCheck();
  }

  get stateOptions(): string[] {
    return Array.from(new Set(this.sourceBranches.map((b) => String(b.state || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  get clientOptions(): string[] {
    return Array.from(new Set(this.sourceBranches.map((b) => String(b.clientName || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  private computeKpis(): void {
    this.kpiTotal = this.branches.length;
    this.kpiHighRisk = this.branches.filter(b => b.riskExposureScore >= 70).length;
    this.kpiOverdue = this.branches.reduce((sum, b) => sum + (b.overdueCount || 0), 0);
    const sum = this.branches.reduce((s, b) => s + (b.compliancePercent || 0), 0);
    this.kpiAvgCompliance = this.branches.length ? Math.round(sum / this.branches.length) : 0;
  }

  riskColor(score: number): string {
    if (score >= 75) return 'error';
    if (score >= 40) return 'warning';
    return 'success';
  }

  riskLabel(score: number): string {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  exportCsv(): void {
    ReportsService.exportCsv(
      this.branches,
      [
        { key: 'branchName', label: 'Branch' },
        { key: 'clientName', label: 'Client' },
        { key: 'state', label: 'State' },
        { key: 'compliancePercent', label: 'Compliance %' },
        { key: 'overdueCount', label: 'Overdue' },
        { key: 'auditScore', label: 'Audit Score' },
        { key: 'riskExposureScore', label: 'Risk Score' },
      ],
      `ceo-branches-${this.month}.csv`,
    );
  }

  clearFilters(): void {
    this.month = new Date().toISOString().slice(0, 7);
    this.q = '';
    this.stateFilter = 'ALL';
    this.clientFilter = 'ALL';
    this.riskBandFilter = 'ALL';
    this.load();
  }
}
