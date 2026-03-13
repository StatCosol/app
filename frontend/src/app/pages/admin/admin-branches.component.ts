import { Component, inject, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-admin-branches',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 24px; max-width: 1200px; margin: 0 auto;">
      <h1 style="font-size: 24px; font-weight: 700; color: #111; margin: 0 0 4px;">
        Branch Management
      </h1>
      <p style="color: #6b7280; margin: 0 0 24px;">Manage all branches across clients</p>

      <!-- Loading -->
      <div *ngIf="loading" style="text-align: center; padding: 48px; color: #6b7280;">
        Loading branches...
      </div>

      <!-- Error -->
      <div *ngIf="error" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
        {{ error }}
      </div>

      <!-- Table -->
      <div *ngIf="!loading && !error" style="background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Name</th>
              <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Code</th>
              <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Client</th>
              <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">State</th>
              <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of branches" style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 12px 16px; font-size: 14px; color: #111;">{{ b.name }}</td>
              <td style="padding: 12px 16px; font-size: 14px; color: #6b7280;">{{ b.code }}</td>
              <td style="padding: 12px 16px; font-size: 14px; color: #6b7280;">{{ b.clientName }}</td>
              <td style="padding: 12px 16px; font-size: 14px; color: #6b7280;">{{ b.state }}</td>
              <td style="padding: 12px 16px;">
                <span [style.background]="b.status === 'ACTIVE' ? '#d1fae5' : '#fee2e2'"
                      [style.color]="b.status === 'ACTIVE' ? '#065f46' : '#991b1b'"
                      style="padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 500;">
                  {{ b.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminBranchesComponent implements OnInit {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  branches: any[] = [];
  loading = false;
  error = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.http
      .get<any[]>('/api/v1/branches')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (data) => (this.branches = data),
        error: () => (this.error = 'Failed to load branches'),
      });
  }
}
