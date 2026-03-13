import { Component, inject, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-payroll-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 24px; max-width: 1200px; margin: 0 auto;">
      <h1 style="font-size: 24px; font-weight: 700; color: #111; margin: 0 0 4px;">
        Payroll Dashboard
      </h1>
      <p style="color: #6b7280; margin: 0 0 24px;">Overview of payroll processing</p>

      <!-- Loading -->
      <div *ngIf="loading" style="text-align: center; padding: 48px; color: #6b7280;">
        Loading summary...
      </div>

      <!-- Error -->
      <div *ngIf="error" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
        {{ error }}
      </div>

      <!-- Stats Cards -->
      <div *ngIf="!loading && !error" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px;">
          <p style="font-size: 13px; color: #6b7280; margin: 0;">Total Runs</p>
          <p style="font-size: 28px; font-weight: 700; color: #111; margin: 4px 0 0;">{{ summary.totalRuns ?? 0 }}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px;">
          <p style="font-size: 13px; color: #6b7280; margin: 0;">Approved</p>
          <p style="font-size: 28px; font-weight: 700; color: #059669; margin: 4px 0 0;">{{ summary.approved ?? 0 }}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px;">
          <p style="font-size: 13px; color: #6b7280; margin: 0;">Draft</p>
          <p style="font-size: 28px; font-weight: 700; color: #d97706; margin: 4px 0 0;">{{ summary.draft ?? 0 }}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px;">
          <p style="font-size: 13px; color: #6b7280; margin: 0;">Rejected</p>
          <p style="font-size: 28px; font-weight: 700; color: #dc2626; margin: 4px 0 0;">{{ summary.rejected ?? 0 }}</p>
        </div>
      </div>
    </div>
  `,
})
export class PayrollHomeComponent implements OnInit {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  summary: any = {};
  loading = false;
  error = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.http
      .get<any>('/api/v1/payroll/summary')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (data) => (this.summary = data),
        error: () => (this.error = 'Failed to load payroll summary'),
      });
  }
}
