import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { ClientSidebarComponent } from './client-sidebar.component';
import { AuthService } from '../../../core/auth.service';
import { NewsTickerComponent } from '../../../shared/news/news-ticker.component';

@Component({
  selector: 'app-client-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, ClientSidebarComponent, NewsTickerComponent],
  template: `
    <div class="client-shell">
      <!-- Mobile menu toggle FAB -->
      <button
        class="lg:hidden fixed bottom-6 right-6 z-50 p-3.5 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 ring-4 ring-white/80 role-fab-client"
        (click)="mobileOpen = true"
        aria-label="Open navigation"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <!-- Sidebar -->
      <app-client-sidebar
        [(collapsed)]="sidebarCollapsed"
        [(mobileOpen)]="mobileOpen"
      ></app-client-sidebar>

      <!-- Main wrapper: top bar + content -->
      <div class="flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300">

        <!-- ─── Top Bar ─── -->
        <header class="bg-white border-b border-gray-200 sticky top-0 z-40" style="box-shadow:0 1px 4px rgba(0,0,0,0.06)">
          <div class="px-3 sm:px-5 lg:px-7">
            <div class="flex items-center justify-between h-[60px] gap-3">

              <!-- LEFT: Logo + Brand + portal chip -->
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex-shrink-0">
                  <svg width="68" height="42" viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="140" cy="110" r="90" fill="#12A8E8"/>
                    <circle cx="220" cy="110" r="90" fill="#0B2A5B"/>
                    <rect x="310" y="30" width="8" height="160" fill="#000000"/>
                  </svg>
                </div>
                <div class="leading-tight hidden sm:block">
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-bold tracking-tight text-statco-blue">StatCo Solutions</span>
                  </div>
                  <p class="text-[11px] font-medium text-slate-400">Client Compliance Platform</p>
                </div>
                <!-- Contact links (xl+) -->
                <div class="hidden xl:flex flex-col items-start gap-0.5 ml-4 text-[11px] text-gray-400 border-l border-gray-100 pl-4">
                  <a href="mailto:compliance@statcosol.com" class="flex items-center gap-1 hover:text-blue-600 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    compliance&#64;statcosol.com
                  </a>
                  <a href="tel:+919000607839" class="flex items-center gap-1 hover:text-blue-600 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    +91 9000607839
                  </a>
                </div>
              </div>

              <!-- CENTER: Quick search (md+) -->
              <div class="hidden md:flex flex-1 max-w-xs mx-4">
                <div class="relative w-full">
                  <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search pages, reports…"
                    (focus)="searchFocused = true"
                    (blur)="searchFocused = false"
                    class="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>

              <!-- RIGHT: actions + user -->
              <div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">

                <!-- Client logo -->
                <img
                  *ngIf="clientLogoUrl"
                  [src]="clientLogoUrl"
                  alt="Client logo"
                  class="h-8 w-auto hidden sm:block mr-1"
                  (error)="onLogoError()"
                />

                <!-- Notification bell -->
                <button
                  (click)="goToQueries()"
                  title="Queries & Notifications"
                  class="relative p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                </button>

                <!-- Calendar quick link -->
                <button
                  (click)="goToCalendar()"
                  title="Compliance Calendar"
                  class="hidden sm:flex p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </button>

                <!-- Divider -->
                <div class="hidden sm:block w-px h-7 bg-gray-200 mx-1"></div>

                <!-- User avatar + name -->
                <div class="hidden sm:flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition-colors cursor-default">
                  <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span class="text-sm font-bold text-white">{{ userInitial }}</span>
                  </div>
                  <div class="hidden lg:block leading-tight">
                    <div class="text-sm font-semibold text-gray-900 leading-none">{{ userName }}</div>
                    <div class="text-[11px] text-gray-400 mt-0.5">Client User</div>
                  </div>
                </div>

                <!-- Logout -->
                <button
                  (click)="logout()"
                  title="Logout"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 active:scale-95 transition-all role-btn-client"
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
        <main class="flex-1 bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
          <div class="client-content">
            <router-outlet></router-outlet>
          </div>
        </main>
      </div>
    </div>
  `,
  styleUrls: ['./client-layout.component.scss']
})
export class ClientLayoutComponent implements OnInit {
  sidebarCollapsed = false;
  mobileOpen = false;
  userName = 'Client User';
  userInitial = 'C';
  clientName = 'Client';
  clientLogoUrl = '';
  searchFocused = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    const u = this.auth.getUser();
    if (u?.name) {
      this.userName = u.name;
      this.userInitial = u.name.charAt(0).toUpperCase();
    }
    const derivedClientName = u?.clientName || u?.client?.name || u?.client_name || u?.client?.clientName;
    if (derivedClientName) this.clientName = derivedClientName;
    const derivedLogo = u?.clientLogoUrl || u?.client?.logoUrl;
    if (derivedLogo) this.clientLogoUrl = this.auth.authenticateUrl(derivedLogo);
  }

  ngOnInit(): void {
    this.auth.fetchMe().subscribe(() => {
      const u = this.auth.getUser();
      const logo = u?.clientLogoUrl || u?.client?.logoUrl;
      if (logo) this.clientLogoUrl = this.auth.authenticateUrl(logo);
      this.cdr.markForCheck();
    });
  }

  goToQueries(): void { void this.router.navigateByUrl('/client/queries'); }
  goToCalendar(): void { void this.router.navigateByUrl('/client/calendar'); }

  onLogoError(): void { this.clientLogoUrl = ''; }

  logout(): void { this.auth.logout('User clicked logout'); }
}
