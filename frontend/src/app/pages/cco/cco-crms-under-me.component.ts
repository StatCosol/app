
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize, timeout } from 'rxjs/operators';
import { CcoCrmsService } from '../../core/cco-crms.service';
import { ToastService } from '../../shared/toast/toast.service';
import { 
  PageHeaderComponent, 
  StatusBadgeComponent, 
  LoadingSpinnerComponent,
  TableColumn
} from '../../shared/ui';

@Component({
  selector: 'app-cco-crms-under-me',
  standalone: true,
  imports: [
    CommonModule, 
    PageHeaderComponent, 
    StatusBadgeComponent, 
    LoadingSpinnerComponent
  ],
  templateUrl: './cco-crms-under-me.component.html',
})
export class CcoCrmsUnderMeComponent implements OnInit {
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

  constructor(private ccoCrmsService: CcoCrmsService, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.ccoCrmsService.list().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.crms = data;
        this.cdr.detectChanges();
      },
      error: (_err) => {
        this.error = 'Failed to load CRMs.';
        this.cdr.detectChanges();
      },
    });
  }

  viewCrm(crm: any) {
    // Placeholder for view action
    this.toast.info('View CRM: ' + crm.name);
  }
}
