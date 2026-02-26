import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { CrmService } from '../../core/crm.service';

@Component({
  selector: 'app-risk-heatmap',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './heatmap.component.html',
  styleUrls: ['./heatmap.component.scss'],
})
export class HeatmapComponent implements OnInit {
  month = this.currentMonth();
  searchTerm = '';
  branches: any[] = [];
  grouped: Record<string, any[]> = {};
  loading = false;

  // CRM client selector
  isCrm = false;
  clients: any[] = [];
  selectedClientId = '';

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private crmService: CrmService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const role = this.auth.getRoleCode();
    this.isCrm = role === 'CRM';

    if (this.isCrm) {
      this.crmService.getAssignedClientsCached().subscribe({
        next: (clients: any[]) => {
          this.clients = clients || [];
          if (this.clients.length) {
            this.selectedClientId = this.clients[0].clientId || this.clients[0].id || '';
          }
          this.cdr.markForCheck();
          this.load();
        },
      });
    } else {
      this.load();
    }
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();

    const params: any = { month: this.month };
    if (this.isCrm && this.selectedClientId) {
      params.clientId = this.selectedClientId;
    }

    this.api.getRiskHeatmap(params).subscribe({
      next: (res: any) => {
        this.branches = res.branches || [];
        this.groupByState();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.branches = [];
        this.grouped = {};
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  groupByState(): void {
    this.grouped = {};
    const filtered = this.searchTerm
      ? this.branches.filter((b) =>
          (b.branchName || '').toLowerCase().includes(this.searchTerm.toLowerCase()),
        )
      : this.branches;

    for (const b of filtered) {
      const state = b.stateCode || 'Unknown';
      if (!this.grouped[state]) this.grouped[state] = [];
      this.grouped[state].push(b);
    }
  }

  onSearch(): void {
    this.groupByState();
    this.cdr.markForCheck();
  }

  get stateKeys(): string[] {
    return Object.keys(this.grouped).sort();
  }

  get highCount(): number {
    return this.branches.filter((b) => b.riskLevel === 'HIGH').length;
  }

  get mediumCount(): number {
    return this.branches.filter((b) => b.riskLevel === 'MEDIUM').length;
  }

  get lowCount(): number {
    return this.branches.filter((b) => b.riskLevel === 'LOW').length;
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
