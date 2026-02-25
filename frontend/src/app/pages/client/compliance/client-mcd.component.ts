import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSpinnerComponent, ActionButtonComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-mcd',
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSpinnerComponent, ActionButtonComponent],
  templateUrl: './client-mcd.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-mcd.component.scss'],
})
export class ClientMcdComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  branches: any[] = [];
  tasks: any[] = [];
  items: Record<string, any[] | null> = {};
  itemsLoading: Record<string, boolean> = {};
  itemsLoaded: Record<string, boolean> = {};
  filters: any = { branchId: '', month: '', year: '' };
  notes: Record<string, string> = {};
  itemNotes: Record<string, string> = {};
  uploading: Record<string, boolean> = {};
  uploadingItem: Record<string, boolean> = {};
  submitting: Record<string, boolean> = {};

  monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleString('en', { month: 'long' }) }));
  yearOptions: number[];

  constructor(private api: ClientComplianceService, private cdr: ChangeDetectorRef) {
    const now = new Date();
    this.filters.month = now.getMonth() + 1;
    this.filters.year = now.getFullYear();
    const y = now.getFullYear();
    this.yearOptions = [y - 1, y, y + 1];
  }

  ngOnInit() {
    this.loadBranches();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches() {
    this.api.getBranches().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.branches = res?.data || res || [];
        if (!this.filters.branchId && this.branches.length) {
          this.filters.branchId = this.branches[0].id;
        }
        this.cdr.detectChanges();
        this.loadTasks();
      },
      error: () => {
        this.branches = [];
        this.cdr.detectChanges();
        this.loadTasks();
      }
    });
  }

  loadTasks() {
    this.loading = true;
    const payload = { ...this.filters, frequency: 'MONTHLY' };
    this.api.getTasks(payload).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.tasks = (res?.data || res || []).map((t: any) => ({
          ...t,
          complianceTitle: t.complianceTitle || t.title || t.compliance?.title,
          branchName: t.branchName || t.branch?.branchName || '-',
          evidenceCount: t.evidenceCount ?? 0,
          dueDate: this.computeDueDateString(t),
        }));
        // Load item checklists for each task (lazy per task)
        this.tasks.forEach((t: any) => this.loadItems(t.id));
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.tasks = []; this.cdr.detectChanges(); }
    });
  }

  loadItems(taskId: string | number) {
    const key = String(taskId);
    if (this.itemsLoading[key]) return;
    if (this.itemsLoaded[key]) return;
    this.itemsLoading[key] = true;
    this.api.getMcdItems(taskId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.itemsLoading[key] = false; this.cdr.detectChanges(); }),
      timeout(10000),
    ).subscribe({
      next: (res: any) => {
        this.itemsLoading[key] = false;
        this.items[key] = res?.data || res || [];
        this.itemsLoaded[key] = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.itemsLoading[key] = false;
        this.items[key] = [];
        this.itemsLoaded[key] = true; // avoid tight retry loop; manual refresh reloads
        this.cdr.detectChanges();
      }
    });
  }

  onFileSelected(task: any, event: any) {
    const file: File | null = event.target?.files?.[0] || null;
    if (!file) return;
    this.uploading[task.id] = true;
    const note = this.notes[String(task.id)] || '';
    this.api.uploadEvidence(task.id, file, note).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploading[task.id] = false; this.cdr.detectChanges(); event.target.value = ''; }),
    ).subscribe({
      next: () => {
        this.uploading[task.id] = false;
        this.notes[String(task.id)] = '';
        this.loadTasks();
      },
      error: () => { this.uploading[task.id] = false; /* silently fail; UI will stop spinner */ }
    });
  }

  onItemFileSelected(task: any, item: any, event: any) {
    const file: File | null = event.target?.files?.[0] || null;
    if (!file) return;
    const key = `${task.id}-${item.id}`;
    this.uploadingItem[key] = true;
    const note = this.itemNotes[key] || '';
    this.api.uploadEvidenceForItem(task.id, item.id, file, note).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploadingItem[key] = false; this.cdr.detectChanges(); event.target.value = ''; }),
    ).subscribe({
      next: () => {
        this.uploadingItem[key] = false;
        this.itemNotes[key] = '';
        this.loadItems(task.id);
        this.loadTasks();
      },
      error: () => { this.uploadingItem[key] = false; }
    });
  }

  submit(task: any) {
    if (task.evidenceCount < 1) return;
    this.submitting[task.id] = true;
    this.api.submitTask(task.id).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting[task.id] = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => { this.submitting[task.id] = false; this.loadTasks(); },
      error: () => { this.submitting[task.id] = false; }
    });
  }

  statusBlocked(task: any) {
    return task.status === 'APPROVED' || task.status === 'SUBMITTED';
  }

  itemStatusLabel(item: any) {
    const s = (item.status || '').toUpperCase();
    if (s === 'VERIFIED') return 'Verified';
    if (s === 'REJECTED') return 'Rejected';
    if (s === 'SUBMITTED') return 'Submitted';
    return 'Pending';
  }

  periodLabel(t: any) {
    const monthIndex = (t.periodMonth || t.month || this.filters.month) - 1;
    const monthName = this.monthOptions[monthIndex]?.label || '';
    return `${monthName} ${t.periodYear || this.filters.year}`;
  }

  private computeDueDateString(t: any): string | null {
    if (t.dueDate) return t.dueDate;
    const year = Number(t.periodYear || this.filters.year);
    const month = Number(t.periodMonth || this.filters.month);
    if (!year || !month) return null;
    // Rule: due on 20th of the following month
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const d = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    return d.toISOString().substring(0, 10);
  }

  dueLabel(t: any) {
    const dueStr = this.computeDueDateString(t);
    if (!dueStr) return '-';
    const due = new Date(dueStr);
    const today = new Date();
    const d = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (t.status === 'OVERDUE' || d < 0) return `Overdue by ${Math.abs(d)} day(s)`;
    if (d === 0) return 'Due today';
    return `Due in ${d} day(s)`;
  }

  windowDates(t: any): { start: string; end: string } | null {
    const year = Number(t.periodYear || this.filters.year);
    const month = Number(t.periodMonth || this.filters.month);
    if (!year || !month) return null;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const start = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    const end = new Date(Date.UTC(nextYear, nextMonth - 1, 25));
    const fmt = (d: Date) => d.toISOString().substring(0, 10);
    return { start: fmt(start), end: fmt(end) };
  }

  isWindowOpen(t: any): boolean {
    const win = this.windowDates(t);
    if (!win) return true;
    const now = new Date();
    const start = new Date(`${win.start}T00:00:00Z`);
    const end = new Date(`${win.end}T23:59:59Z`);
    return now >= start && now <= end;
  }

  windowStatusText(t: any): string {
    const win = this.windowDates(t);
    if (!win) return '';
    const now = new Date();
    const start = new Date(`${win.start}T00:00:00Z`);
    const end = new Date(`${win.end}T23:59:59Z`);
    if (now < start) return `Opens ${win.start}`;
    if (now > end) return `Closed ${win.end}`;
    return `Open until ${win.end}`;
  }
}
