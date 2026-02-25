import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  FormSelectComponent,
  StatusBadgeComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
} from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-auditor-observations',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    FormSelectComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './auditor-observations.component.html',
  styleUrls: ['./auditor-observations.component.scss'],
})
export class AuditorObservationsComponent implements OnInit, OnDestroy {
  loading = true;
  private destroy$ = new Subject<void>();
  observations: any[] = [];
  categories: any[] = [];
  auditId: string | null = null;
  showForm = false;
  editingId: string | null = null;
  saving = false;
  deletingId: string | null = null;

  form = {
    auditId: '',
    categoryId: '',
    observation: '',
    consequences: '',
    complianceRequirements: '',
    elaboration: '',
    status: 'OPEN',
  };

  // Select options
  get categoryOptions() {
    return [
      { value: '', label: 'Select Category' },
      ...this.categories.map(cat => ({ value: cat.id, label: cat.name }))
    ];
  }

  statusOptions = [
    { value: 'OPEN', label: 'Open' },
    { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CLOSED', label: 'Closed' }
  ];

  constructor(
    private api: AuditorObservationsService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.auditId = params['auditId'] || null;
      this.loadCategories();
      this.loadObservations();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCategories() {
    this.api.listCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.categories = res || [];
        this.cdr.detectChanges();
      },
    });
  }

  loadObservations() {
    this.loading = true;
    this.api.list(this.auditId).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.observations = res || [];
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  openForm() {
    this.showForm = true;
    this.editingId = null;
    this.form = {
      auditId: this.auditId || '',
      categoryId: '',
      observation: '',
      consequences: '',
      complianceRequirements: '',
      elaboration: '',
      status: 'OPEN',
    };
  }

  editObservation(obs: any) {
    this.showForm = true;
    this.editingId = obs.id;
    this.form = {
      auditId: obs.auditId,
      categoryId: obs.categoryId || '',
      observation: obs.observation,
      consequences: obs.consequences || '',
      complianceRequirements: obs.complianceRequirements || '',
      elaboration: obs.elaboration || '',
      status: obs.status,
    };
  }

  cancelForm() {
    this.showForm = false;
    this.editingId = null;
  }

  save() {
    if (!this.form.observation || this.saving) {
      if (!this.form.observation) alert('Observation is required');
      return;
    }
    this.saving = true;

    if (this.editingId) {
      this.api.update(this.editingId, this.form).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.cancelForm();
          this.cdr.detectChanges();
          this.loadObservations();
        },
        error: (err) => { this.saving = false; this.cdr.detectChanges(); alert(err?.error?.message || 'Update failed'); },
      });
    } else {
      this.api.create(this.form).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saving = false;
          this.cancelForm();
          this.cdr.detectChanges();
          this.loadObservations();
        },
        error: (err) => { this.saving = false; this.cdr.detectChanges(); alert(err?.error?.message || 'Create failed'); },
      });
    }
  }

  deleteObservation(id: string) {
    if (this.deletingId || !confirm('Delete this observation?')) return;
    this.deletingId = id;
    this.api.delete(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.deletingId = null; this.cdr.detectChanges(); this.loadObservations(); },
      error: () => { this.deletingId = null; this.cdr.detectChanges(); },
    });
  }

  getStatusClass(status: string): string {
    const map: any = {
      OPEN: 'open',
      ACKNOWLEDGED: 'acknowledged',
      RESOLVED: 'resolved',
      CLOSED: 'closed',
    };
    return map[status] || 'open';
  }
}
