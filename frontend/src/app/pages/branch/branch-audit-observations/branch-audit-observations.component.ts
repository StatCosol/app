import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AuthService } from '../../../core/auth.service';

interface AuditObservation {
  id: string;
  observationRef: string;
  category: string;
  description: string;
  raisedDate: string;
  dueDate: string;
  severity: 'Critical' | 'Major' | 'Minor';
  status: 'Open' | 'In Progress' | 'Closed';
  assignedTo: string;
}

@Component({
  selector: 'app-branch-audit-observations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Audit Observations</h1>
          <p class="page-subtitle">Track and resolve audit observations raised during compliance audits</p>
        </div>
        <div class="flex items-center gap-3">
          <select [(ngModel)]="statusFilter" (change)="applyFilter()" class="filter-select">
            <option value="all">All Status</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
          </select>
          <select [(ngModel)]="severityFilter" (change)="applyFilter()" class="filter-select">
            <option value="all">All Severity</option>
            <option value="Critical">Critical</option>
            <option value="Major">Major</option>
            <option value="Minor">Minor</option>
          </select>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="summary-strip">
        <div class="summary-card border-l-4 border-red-500">
          <span class="summary-value text-red-600">{{ openCount }}</span>
          <span class="summary-label">Open</span>
        </div>
        <div class="summary-card border-l-4 border-amber-500">
          <span class="summary-value text-amber-600">{{ inProgressCount }}</span>
          <span class="summary-label">In Progress</span>
        </div>
        <div class="summary-card border-l-4 border-emerald-500">
          <span class="summary-value text-emerald-600">{{ closedCount }}</span>
          <span class="summary-label">Closed</span>
        </div>
        <div class="summary-card border-l-4 border-purple-500">
          <span class="summary-value text-purple-600">{{ criticalCount }}</span>
          <span class="summary-label">Critical</span>
        </div>
      </div>

      <!-- Observations table -->
      <div class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ref #</th>
                <th>Category</th>
                <th>Description</th>
                <th>Raised</th>
                <th>Due</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned To</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let obs of filteredItems; trackBy: trackById" class="data-row">
                <td class="font-mono text-xs text-blue-600 font-medium">{{ obs.observationRef }}</td>
                <td class="text-slate-700 font-medium">{{ obs.category }}</td>
                <td class="text-slate-600 max-w-xs truncate">{{ obs.description }}</td>
                <td class="text-slate-500 text-xs">{{ obs.raisedDate }}</td>
                <td class="text-xs" [class.text-red-600]="isOverdue(obs)" [class.font-semibold]="isOverdue(obs)" [class.text-slate-500]="!isOverdue(obs)">{{ obs.dueDate }}</td>
                <td>
                  <span class="sev-badge"
                    [class.sev-critical]="obs.severity === 'Critical'"
                    [class.sev-major]="obs.severity === 'Major'"
                    [class.sev-minor]="obs.severity === 'Minor'">
                    {{ obs.severity }}
                  </span>
                </td>
                <td>
                  <span class="status-pill"
                    [class.st-open]="obs.status === 'Open'"
                    [class.st-progress]="obs.status === 'In Progress'"
                    [class.st-closed]="obs.status === 'Closed'">
                    {{ obs.status }}
                  </span>
                </td>
                <td class="text-slate-600">{{ obs.assignedTo }}</td>
              </tr>
              <tr *ngIf="filteredItems.length === 0">
                <td colspan="8" class="text-center text-slate-400 py-12">No observations match the current filter</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .filter-select { padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; background: white; cursor: pointer; }
    .summary-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (max-width: 640px) { .summary-strip { grid-template-columns: repeat(2, 1fr); } }
    .summary-card { background: white; border-radius: 0.75rem; padding: 1rem; text-align: center; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .summary-value { display: block; font-size: 1.5rem; font-weight: 800; }
    .summary-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .sev-badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .sev-critical { background: #fee2e2; color: #991b1b; }
    .sev-major { background: #fef3c7; color: #92400e; }
    .sev-minor { background: #dbeafe; color: #1e40af; }
    .status-pill { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .st-open { background: #fee2e2; color: #991b1b; }
    .st-progress { background: #fef3c7; color: #92400e; }
    .st-closed { background: #d1fae5; color: #065f46; }
    .max-w-xs { max-width: 250px; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `]
})
export class BranchAuditObservationsComponent implements OnInit {
  statusFilter = 'all';
  severityFilter = 'all';
  observations: AuditObservation[] = [];
  filteredItems: AuditObservation[] = [];
  openCount = 0;
  inProgressCount = 0;
  closedCount = 0;
  criticalCount = 0;
  loading = true;

  constructor(
    private cdr: ChangeDetectorRef,
    private branchSvc: ClientBranchesService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    if (!branchIds.length) { this.loading = false; this.cdr.markForCheck(); return; }
    const branchId = branchIds[0];

    this.branchSvc.listAuditObservations(branchId).subscribe({
      next: (rows) => {
        this.observations = (rows || []).map((r: any): AuditObservation => ({
          id: r.id,
          observationRef: r.observationRef || r.id?.substring(0, 8) || '',
          category: r.category || 'General',
          description: r.description || '',
          raisedDate: r.raisedDate || '',
          dueDate: r.dueDate || '—',
          severity: r.severity || 'Minor',
          status: r.status || 'Open',
          assignedTo: r.assignedTo || '—',
        }));
        this.computeCounts();
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  applyFilter(): void {
    let result = [...this.observations];
    if (this.statusFilter !== 'all') result = result.filter(o => o.status === this.statusFilter);
    if (this.severityFilter !== 'all') result = result.filter(o => o.severity === this.severityFilter);
    this.filteredItems = result;
    this.cdr.markForCheck();
  }

  isOverdue(obs: AuditObservation): boolean {
    if (obs.status === 'Closed') return false;
    return new Date(obs.dueDate) < new Date();
  }

  trackById(_: number, item: AuditObservation): string { return item.id; }

  private computeCounts(): void {
    this.openCount = this.observations.filter(o => o.status === 'Open').length;
    this.inProgressCount = this.observations.filter(o => o.status === 'In Progress').length;
    this.closedCount = this.observations.filter(o => o.status === 'Closed').length;
    this.criticalCount = this.observations.filter(o => o.severity === 'Critical').length;
  }

}
