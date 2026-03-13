import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AuthService } from '../../../core/auth.service';
import { DataTableComponent, TableCellDirective, TableColumn } from '../../../shared/ui';

@Component({
  selector: 'app-client-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule, DataTableComponent, TableCellDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './client-registrations.component.html'
})
export class ClientRegistrationsComponent implements OnInit, OnDestroy {

  branches: any[] = [];
  selectedBranchId = '';
  registrations: any[] = [];
  filtered: any[] = [];

  readonly regColumns: TableColumn[] = [
    { key: 'type', header: 'Registration' },
    { key: 'registrationNumber', header: 'Number' },
    { key: 'authority', header: 'Authority' },
    { key: 'issuedDate', header: 'Issued' },
    { key: 'expiryDate', header: 'Expiry' },
    { key: 'daysRemaining', header: 'Days', align: 'center' },
    { key: 'computedStatus', header: 'Status', align: 'center' },
  ];

  active = 0;
  expiring = 0;
  expired = 0;

  statusFilter = 'all';
  loading = true;
  error: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private branchSvc: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const mapped = this.auth.getBranchIds();

    if (mapped?.length) {
      this.selectedBranchId = mapped[0];
      this.branches = mapped.map(id => ({ id, name: 'Branch' }));
      this.load();
      this.branchSvc.list().pipe(takeUntil(this.destroy$)).subscribe({
        next: (b: any[]) => {
          const nameMap = new Map((b || []).map((x: any) => [x.id, x.name || x.branchName || 'Branch']));
          this.branches = mapped.map(id => ({ id, name: nameMap.get(id) || 'Branch' }));
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.branchSvc.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows) => {
        this.branches = rows || [];
        this.selectedBranchId = this.branches[0]?.id || '';
        if (this.selectedBranchId) this.load();
        else { this.loading = false; this.cdr.markForCheck(); }
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  load() {
    if (!this.selectedBranchId) return;

    this.loading = true;
    this.cdr.markForCheck();

    this.branchSvc.listRegistrations(this.selectedBranchId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows) => {
        this.registrations = rows || [];
        this.computeCounts();
        this.applyFilter();
        this.loading = false;
        this.error = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.registrations = [];
        this.filtered = [];
        this.loading = false;
        this.error = 'Failed to load registrations. Please try again.';
        this.cdr.markForCheck();
      },
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
