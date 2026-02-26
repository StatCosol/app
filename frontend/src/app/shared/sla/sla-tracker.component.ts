import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-sla-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sla-tracker.component.html',
  styleUrls: ['./sla-tracker.component.scss'],
})
export class SlaTrackerComponent implements OnInit {
  status = 'OPEN';
  module = 'ALL';
  branchId = '';

  branches: any[] = [];
  items: any[] = [];
  loading = false;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const mapped = this.auth.getBranchIds();
    if (mapped?.length) {
      this.branchId = mapped[0];
      this.branches = [{ id: mapped[0], name: 'My Branch' }];
      this.load();
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
    this.loading = true;
    this.cdr.markForCheck();

    const params: any = { status: this.status };
    if (this.module !== 'ALL') params.module = this.module;
    if (this.branchId) params.branchId = this.branchId;

    this.api.getSlaTasks(params).subscribe({
      next: (res: any) => {
        this.items = res.items || [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.items = [];
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  setStatus(it: any, status: string): void {
    this.api.updateSlaTask(it.id, { status }).subscribe({
      next: () => this.load(),
    });
  }

  get openCount(): number {
    return this.items.filter((i) => i.status === 'OPEN').length;
  }

  get overdueCount(): number {
    return this.items.filter((i) => i.status === 'OVERDUE').length;
  }
}
