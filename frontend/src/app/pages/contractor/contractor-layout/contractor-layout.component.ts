import { Component , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ContractorSidebarComponent } from './contractor-sidebar.component';
import { AuthService } from '../../../core/auth.service';
import { NewsTickerComponent } from '../../../shared/news/news-ticker.component';

@Component({
  selector: 'app-contractor-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, ContractorSidebarComponent, NewsTickerComponent],
  template: `
    <div class="contractor-shell">
      <!-- Mobile menu toggle -->
      <button
        class="lg:hidden fixed bottom-6 right-6 z-50 p-3.5 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 ring-4 ring-white/80 role-fab-contractor"
        (click)="mobileOpen = true"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <!-- Sidebar -->
      <app-contractor-sidebar
        [(collapsed)]="sidebarCollapsed"
        [(mobileOpen)]="mobileOpen"
      ></app-contractor-sidebar>

      <!-- Main wrapper: top bar + content -->
      <div class="flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300">
        <!-- Slim top bar -->
        <header class="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div class="px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-14">
              <!-- Logo + Brand -->
              <div class="flex items-center gap-5">
                <div class="flex-shrink-0" aria-hidden="true">
                  <svg width="78" height="48" viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="140" cy="110" r="90" fill="#12A8E8" />
                    <circle cx="220" cy="110" r="90" fill="#0B2A5B" />
                    <rect x="310" y="30" width="8" height="160" fill="#000000" />
                  </svg>
                </div>
                <div class="leading-tight">
                  <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-statco-blue font-brand">
                    StatCo Solutions
                  </h1>
                  <p class="text-xs font-medium text-slate-500">Ensuring Compliance, Empowering Success</p>
                </div>
                <!-- Contact (xl+) -->
                <div class="hidden xl:flex flex-col items-start gap-1 ml-6 text-xs text-gray-400">
                  <a href="mailto:compliance@statcosol.com" class="flex items-center gap-1.5 hover:text-statco-blue transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    compliance&#64;statcosol.com
                  </a>
                  <a href="tel:+919000607839" class="flex items-center gap-1.5 hover:text-statco-blue transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    +91 9000607839
                  </a>
                </div>
              </div>

              <!-- User + Logout -->
              <div class="flex items-center gap-4">
                <img
                  *ngIf="clientLogoUrl"
                  [src]="clientLogoUrl"
                  alt="Client logo"
                  class="h-10 w-auto hidden sm:block"
                  (error)="onLogoError()"
                />
                <div class="hidden sm:block text-sm font-semibold text-gray-900">{{ userName }}</div>
                <button
                  (click)="logout()"
                  class="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 role-btn-contractor"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                  </svg>
                  <span class="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- News ticker ribbon -->
        <app-news-ticker></app-news-ticker>

        <!-- Page content -->
        <main class="flex-1 bg-gradient-to-br from-slate-50 via-rose-50/30 to-slate-50">
          <div class="contractor-content">
            <router-outlet></router-outlet>
          </div>
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .contractor-shell { display: flex; min-height: 100vh; }
    .contractor-content {
      min-height: calc(100vh - 56px);
      width: 100%;
      max-width: 80rem;
      margin: 0 auto;
      padding: 1.25rem 0.75rem;
    }
    @media (min-width: 640px) { .contractor-content { padding: 1.5rem 1rem; } }
    @media (min-width: 1024px) { .contractor-content { padding: 2rem 1.5rem; } }
  `]
})
export class ContractorLayoutComponent {
  sidebarCollapsed = false;
  mobileOpen = false;
  userName = 'Contractor User';
  clientLogoUrl = '';

  constructor(private auth: AuthService) {
    const u = this.auth.getUser();
    if (u?.name) this.userName = u.name;
    const derivedLogo = u?.clientLogoUrl || u?.client?.logoUrl;
    if (derivedLogo) this.clientLogoUrl = this.auth.authenticateUrl(derivedLogo);
  }

  onLogoError(): void {
    this.clientLogoUrl = '';
  }

  logout(): void {
    this.auth.logout('User clicked logout');
  }
}
