import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-client-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './client-registrations.component.html'
})
export class ClientRegistrationsComponent implements OnInit {

  branches: any[] = [];
  selectedBranchId = '';
  registrations: any[] = [];
  filtered: any[] = [];

  active = 0;
  expiring = 0;
  expired = 0;

  statusFilter = 'all';
  loading = true;

  constructor(
    private branchSvc: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const mapped = this.auth.getBranchIds();

    if (mapped?.length) {
      this.selectedBranchId = mapped[0];
      this.branches = [{ id: mapped[0], name: 'My Branch' }];
      this.load();
      return;
    }

    this.branchSvc.list().subscribe({
      next: (rows) => {
        this.branches = rows || [];
        this.selectedBranchId = this.branches[0]?.id || '';
        if (this.selectedBranchId) this.load();
      }
    });
  }

  load() {
    if (!this.selectedBranchId) return;

    this.loading = true;

    this.branchSvc.listRegistrations(this.selectedBranchId).subscribe({
      next: (rows) => {
        this.registrations = rows || [];
        this.computeCounts();
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  applyFilter() {
    if (this.statusFilter === 'all') {
      this.filtered = [...this.registrations];
    } else {
      this.filtered = this.registrations.filter(r => r.computedStatus === this.statusFilter);
    }
  }

  computeCounts() {
    this.active = this.registrations.filter(r => r.computedStatus === 'ACTIVE').length;
    this.expiring = this.registrations.filter(r => r.computedStatus === 'EXPIRING_SOON').length;
    this.expired = this.registrations.filter(r => r.computedStatus === 'EXPIRED').length;
  }
}
