import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SalesSidebarComponent } from './sales-sidebar.component';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-sales-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SalesSidebarComponent],
  template: `
    <div class="flex min-h-screen">
      <button
        class="lg:hidden fixed bottom-6 right-6 z-50 p-3 text-white rounded-full shadow-xl bg-emerald-600 hover:bg-emerald-700"
        (click)="mobileOpen = true"
        aria-label="Open menu"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <app-sales-sidebar
        [(collapsed)]="sidebarCollapsed"
        [(mobileOpen)]="mobileOpen"
      ></app-sales-sidebar>

      <div class="flex-1 flex flex-col min-h-screen min-w-0">
        <header class="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div class="px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
            <div class="flex items-center gap-3">
              <div class="leading-tight">
                <h1 class="text-lg sm:text-xl font-bold text-emerald-800">StatCo Sales</h1>
                <p class="text-xs text-slate-500">Business Development & Pipeline</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="hidden sm:block text-sm font-medium text-gray-700">{{ userName }}</span>
              <button
                (click)="logout()"
                class="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white rounded-lg bg-emerald-600 hover:bg-emerald-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                <span class="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main class="flex-1 bg-slate-50">
          <div class="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <router-outlet></router-outlet>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class SalesLayoutComponent implements OnInit, OnDestroy {
  sidebarCollapsed = false;
  mobileOpen = false;
  userName = 'Sales User';
  private destroy$ = new Subject<void>();

  constructor(private auth: AuthService) {
    const u = this.auth.getUser();
    if (u?.name) this.userName = u.name;
  }

  ngOnInit(): void {
    this.auth.fetchMe().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout(): void {
    this.auth.logout('User clicked logout');
  }
}
