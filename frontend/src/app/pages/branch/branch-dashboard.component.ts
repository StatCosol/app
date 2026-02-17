import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent],
  template: `
    <ui-page-header
      title="BranchDesk"
      description="Upload MCD and returns for your branch"
      icon="shield-check"
    ></ui-page-header>

    <div class="grid gap-4 sm:grid-cols-2 mt-4">
      <a routerLink="/branch/mcd" class="card">
        <div class="card-icon bg-blue-50 text-blue-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3" />
          </svg>
        </div>
        <div>
          <p class="card-title">Monthly Compliance Data</p>
          <p class="card-sub">Upload evidence and submit for approval</p>
        </div>
      </a>

      <a routerLink="/branch/returns" class="card">
        <div class="card-icon bg-amber-50 text-amber-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z" />
          </svg>
        </div>
        <div>
          <p class="card-title">Returns / Filings</p>
          <p class="card-sub">Upload acknowledgements and challans</p>
        </div>
      </a>
    </div>
  `,
  styles: [
    `
    .card { @apply flex items-center gap-3 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-sm hover:shadow-md transition; }
    .card-icon { @apply w-11 h-11 rounded-xl flex items-center justify-center; }
    .card-title { @apply text-sm font-semibold text-slate-800; }
    .card-sub { @apply text-xs text-slate-500; }
    `,
  ],
})
export class BranchDashboardComponent {}
