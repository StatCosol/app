
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { CcoCrmsService } from '../../core/cco-crms.service';
import { ToastService } from '../../shared/toast/toast.service';
import { 
  PageHeaderComponent, 
  StatusBadgeComponent, 
  LoadingSpinnerComponent,
  ActionButtonComponent,
  TableColumn
} from '../../shared/ui';

@Component({
  selector: 'app-cco-crms-under-me',
  standalone: true,
  imports: [
    CommonModule, 
    PageHeaderComponent, 
    StatusBadgeComponent, 
    LoadingSpinnerComponent,
    ActionButtonComponent
  ],
  templateUrl: './cco-crms-under-me.component.html',
})
export class CcoCrmsUnderMeComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  crms: any[] = [];
  loading = true;
  error = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'CRM Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'assigned_clients_count', header: 'Assigned Clients', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: 'Actions', sortable: false },
  ];

  constructor(private ccoCrmsService: CcoCrmsService, private toast: ToastService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.ccoCrmsService.list().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.crms = data;
        this.cdr.detectChanges();
      },
      error: (_err) => {
        this.loading = false;
        this.error = 'Failed to load CRMs.';
        this.cdr.detectChanges();
      },
    });
  }

  viewCrm(crm: any) {
    this.router.navigate(['/cco/crms', crm.id]);
  }

  retry(): void {
    this.loading = true;
    this.error = '';
    this.ngOnInit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
