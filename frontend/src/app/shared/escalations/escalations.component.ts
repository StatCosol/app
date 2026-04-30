import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';

@Component({
  standalone: true,
  selector: 'app-escalations',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './escalations.component.html',
  styleUrls: ['./escalations.component.scss'],
})
export class EscalationsComponent implements OnInit {
  items: any[] = [];
  filtered: any[] = [];
  loading = false;

  branches: any[] = [];
  selectedBranch = '';
  selectedStatus = '';

  roleCode = '';
  isBranchUser = false;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.roleCode = this.auth.getRoleCode();
    const bids = this.auth.getBranchIds();
    this.isBranchUser = bids.length > 0 && !this.auth.isMasterUser();

    // Load branch list for filter
    if (!this.isBranchUser) {
      this.api.list().subscribe({
        next: (res: any) => {
          this.branches = res || [];
          this.cdr.markForCheck();
        },
      });
    }

    this.load();
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();

    const params: any = {};
    if (this.selectedStatus) params.status = this.selectedStatus;
    if (this.selectedBranch) params.branchId = this.selectedBranch;

    this.api.getEscalations(params).subscribe({
      next: (res: any) => {
        this.items = res.items || [];
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.items = [];
        this.filtered = [];
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  applyFilter(): void {
    this.filtered = this.items;
  }

  updateStatus(item: any, status: string): void {
    this.api.updateEscalation(item.id, { status }).subscribe({
      next: () => this.load(),
    });
  }

  severityClass(score: number): string {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  get openCount(): number {
    return this.items.filter((i) => i.status === 'OPEN').length;
  }

  get ackCount(): number {
    return this.items.filter((i) => i.status === 'ACK').length;
  }

  get closedCount(): number {
    return this.items.filter((i) => i.status === 'CLOSED').length;
  }
}
