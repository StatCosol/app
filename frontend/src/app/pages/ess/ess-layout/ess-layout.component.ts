import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { EssApiService } from '../ess-api.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-ess-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule],
  template: `
    <div class="shell" [class.sb-collapsed]="sidebarCollapsed" [class.sb-mobile-open]="mobileOpen">
      <!-- ==== SIDEBAR ==== -->
      <aside class="sidebar">
        <!-- brand -->
        <div class="sb-brand">
          <span class="sb-logo" *ngIf="!companyLogoUrl">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </span>
          <img *ngIf="companyLogoUrl" [src]="companyLogoUrl" alt="" class="sb-logo-img" />
          <span class="sb-brand-text">
            <strong>{{ companyName }}</strong>
            <small>Employee Portal</small>
          </span>
        </div>

        <!-- toggle -->
        <button class="sb-toggle desktop-only" (click)="toggleSidebar()" title="Toggle sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
        </button>

        <!-- nav -->
        <nav class="sb-nav">
          <a *ngFor="let item of navItems"
             [routerLink]="item.route"
             routerLinkActive="active"
             [routerLinkActiveOptions]="{ exact: item.route.endsWith('dashboard') }"
             class="sb-link"
             [attr.data-tip]="item.label">
            <span class="sb-icon" [innerHTML]="item.icon"></span>
            <span class="sb-label">{{ item.label }}</span>
          </a>
        </nav>

        <!-- sidebar footer (shown when expanded) -->
        <div class="sb-foot">
          <div class="sb-foot-info">
            <span class="sb-foot-name">{{ userName }}</span>
            <span class="sb-foot-code">{{ userCode }}</span>
          </div>
        </div>
      </aside>

      <!-- MOBILE OVERLAY -->
      <div class="overlay" *ngIf="mobileOpen" (click)="mobileOpen=false"></div>

      <!-- ==== MAIN AREA ==== -->
      <div class="main-wrap">
        <!-- TOPBAR -->
        <header class="topbar">
          <!-- hamburger (mobile) -->
          <button class="tb-hamburger mobile-only" (click)="mobileOpen=!mobileOpen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
          </button>

          <!-- company name (mobile) -->
          <span class="tb-title mobile-only">{{ companyName }}</span>

          <div class="tb-spacer"></div>

          <!-- avatar dropdown -->
          <div class="tb-avatar-wrap" (click)="avatarOpen=!avatarOpen">
            <div class="tb-avatar">{{ initials }}</div>
            <svg class="tb-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>

            <div class="dropdown" *ngIf="avatarOpen">
              <div class="dd-header">
                <strong>{{ userName }}</strong>
                <small>{{ userCode }}</small>
              </div>
              <a class="dd-item" routerLink="/ess/profile" (click)="avatarOpen=false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
                My Profile
              </a>
              <div class="dd-sep"></div>
              <button class="dd-item dd-danger" (click)="logout()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <!-- PAGE CONTENT -->
        <main class="page-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    /* ─── TOKENS ──────────────────── */
    :host { --sb-w: 248px; --sb-cw: 68px; --tb-h: 60px; font-family: 'Inter', system-ui, -apple-system, sans-serif; }

    /* ─── SHELL GRID ─────────────── */
    .shell { display: flex; min-height: 100vh; background: #f4f6fa; }

    /* ─── SIDEBAR ────────────────── */
    .sidebar {
      width: var(--sb-w); min-width: var(--sb-w);
      background: linear-gradient(180deg, #071224, #0e2249 100%);
      display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh;
      overflow-y: auto; overflow-x: hidden;
      transition: width .25s cubic-bezier(.4,0,.2,1), min-width .25s cubic-bezier(.4,0,.2,1);
      z-index: 40;
    }
    .sb-collapsed .sidebar { width: var(--sb-cw); min-width: var(--sb-cw); }

    /* brand */
    .sb-brand {
      display: flex; align-items: center; gap: 10px;
      padding: 18px 16px 14px; white-space: nowrap;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }
    .sb-logo { color: #60a5fa; flex-shrink: 0; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(96,165,250,.12); }
    .sb-logo-img { width: 36px; height: 36px; border-radius: 10px; object-fit: contain; flex-shrink: 0; }
    .sb-brand-text { overflow: hidden; transition: opacity .2s; }
    .sb-brand-text strong { display: block; color: #fff; font-size: 14px; font-weight: 700; }
    .sb-brand-text small { color: rgba(255,255,255,.4); font-size: 11px; }
    .sb-collapsed .sb-brand-text { opacity: 0; width: 0; }

    /* toggle */
    .sb-toggle {
      position: absolute; top: 18px; right: -14px;
      width: 28px; height: 28px; border-radius: 50%;
      background: #fff; border: 1.5px solid #e5e7eb;
      display: grid; place-items: center; cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.08);
      z-index: 50; transition: transform .2s;
    }
    .sb-toggle svg { width: 14px; height: 14px; color: #374151; }
    .sb-toggle:hover { background: #f3f4f6; }
    .sb-collapsed .sb-toggle { transform: rotate(90deg); }

    /* nav */
    .sb-nav { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
    .sb-link {
      position: relative;
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 8px;
      color: rgba(255,255,255,.55); font-size: 14px; font-weight: 500;
      text-decoration: none; white-space: nowrap;
      transition: background .15s, color .15s;
    }
    .sb-link:hover { background: rgba(255,255,255,.06); color: rgba(255,255,255,.85); }
    .sb-link.active { background: rgba(99,102,241,.2); color: #a5b4fc; }
    .sb-icon { width: 20px; height: 20px; flex-shrink: 0; display: flex; }
    .sb-icon svg, .sb-icon :first-child { width: 20px; height: 20px; }
    .sb-label { transition: opacity .2s; }
    .sb-collapsed .sb-label { opacity: 0; width: 0; overflow: hidden; }
    .sb-collapsed .sb-link { justify-content: center; padding: 10px 0; }

    /* tooltip on collapsed */
    .sb-collapsed .sb-link::after {
      content: attr(data-tip);
      position: absolute; left: calc(var(--sb-cw) - 8px); top: 50%; transform: translateY(-50%);
      background: #1e293b; color: #fff; font-size: 12px; font-weight: 500;
      padding: 5px 10px; border-radius: 6px; white-space: nowrap;
      pointer-events: none; opacity: 0; transition: opacity .15s;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
    }
    .sb-collapsed .sb-link:hover::after { opacity: 1; }

    /* footer */
    .sb-foot {
      padding: 12px 14px;
      border-top: 1px solid rgba(255,255,255,.07);
      overflow: hidden;
    }
    .sb-foot-info { display: flex; flex-direction: column; }
    .sb-foot-name { color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-foot-code { color: rgba(255,255,255,.4); font-size: 11px; }
    .sb-collapsed .sb-foot { display: none; }

    /* ─── OVERLAY (mobile) ─────── */
    .overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 35;
    }

    /* ─── MAIN WRAP ──────────────── */
    .main-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    /* ─── TOPBAR ─────────────────── */
    .topbar {
      height: var(--tb-h); min-height: var(--tb-h);
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      display: flex; align-items: center;
      padding: 0 20px; gap: 12px;
      position: sticky; top: 0; z-index: 30;
    }
    .tb-spacer { flex: 1; }
    .tb-title { font-size: 16px; font-weight: 700; color: #0f172a; }

    .tb-hamburger, .mobile-only { display: none; }
    .tb-hamburger {
      background: none; border: none; cursor: pointer;
      padding: 6px; border-radius: 8px; color: #374151;
    }
    .tb-hamburger:hover { background: #f3f4f6; }
    .tb-hamburger svg { width: 22px; height: 22px; }

    /* avatar */
    .tb-avatar-wrap {
      position: relative;
      display: flex; align-items: center; gap: 6px;
      cursor: pointer; padding: 4px 8px;
      border-radius: 10px; transition: background .15s;
    }
    .tb-avatar-wrap:hover { background: #f3f4f6; }
    .tb-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #4338ca);
      color: #fff; font-size: 14px; font-weight: 700;
      display: grid; place-items: center;
    }
    .tb-chev { width: 14px; height: 14px; color: #9ca3af; }

    /* dropdown */
    .dropdown {
      position: absolute; right: 0; top: calc(100% + 6px);
      width: 220px;
      background: #fff; border: 1px solid #e5e7eb;
      border-radius: 12px; padding: 6px;
      box-shadow: 0 10px 30px rgba(0,0,0,.1);
      z-index: 100;
    }
    .dd-header {
      padding: 10px 12px 8px; border-bottom: 1px solid #f3f4f6;
    }
    .dd-header strong { display: block; font-size: 14px; color: #111827; }
    .dd-header small { font-size: 12px; color: #6b7280; }
    .dd-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 9px 12px; border-radius: 8px;
      font-size: 13px; font-weight: 500; color: #374151;
      background: none; border: none; cursor: pointer;
      text-decoration: none; transition: background .12s;
    }
    .dd-item:hover { background: #f3f4f6; }
    .dd-item svg { width: 18px; height: 18px; flex-shrink: 0; }
    .dd-danger { color: #dc2626; }
    .dd-danger:hover { background: #fef2f2; }
    .dd-sep { height: 1px; background: #f3f4f6; margin: 4px 0; }

    /* ─── PAGE CONTENT ────────────── */
    .page-content { flex: 1; padding: 24px; overflow-y: auto; }

    /* ─── MOBILE ──────────────────── */
    @media (max-width: 860px) {
      .desktop-only { display: none !important; }
      .mobile-only { display: flex !important; }
      .sidebar {
        position: fixed; left: 0; top: 0; bottom: 0;
        transform: translateX(-100%);
        transition: transform .25s cubic-bezier(.4,0,.2,1);
        width: var(--sb-w) !important; min-width: var(--sb-w) !important;
      }
      .sb-mobile-open .sidebar { transform: translateX(0); }
      .sb-brand-text { opacity: 1 !important; width: auto !important; }
      .sb-label { opacity: 1 !important; width: auto !important; }
      .sb-foot { display: block !important; }
      .page-content { padding: 16px; }
    }
  `],
})
export class EssLayoutComponent implements OnInit {
  userName = '';
  userCode = '';
  initials = '';
  companyName = 'Employee Desk';
  companyLogoUrl: string | null = null;
  sidebarCollapsed = false;
  mobileOpen = false;
  avatarOpen = false;

  navItems: NavItem[] = [
    {
      label: 'Dashboard',
      route: '/ess/dashboard',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>',
    },
    {
      label: 'My Profile',
      route: '/ess/profile',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>',
    },
    {
      label: 'My PF',
      route: '/ess/pf',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg>',
    },
    {
      label: 'My ESI',
      route: '/ess/esi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>',
    },
    {
      label: 'Nominations',
      route: '/ess/nominations',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/></svg>',
    },
    {
      label: 'Leave',
      route: '/ess/leave',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>',
    },
    {
      label: 'Payslips',
      route: '/ess/payslips',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>',
    },
  ];

  constructor(private auth: AuthService, private router: Router, private api: EssApiService) {
    const u = this.auth.getUser();
    this.userName = u?.name || 'Employee';
    this.userCode = u?.employeeCode || u?.email || '';
    this.initials = this.userName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
    if (u?.clientName) {
      this.companyName = u.clientName;
    }
    // Use logo from login response immediately (before API call)
    if (u?.clientLogoUrl) {
      this.companyLogoUrl = u.clientLogoUrl;
    }
  }

  ngOnInit(): void {
    this.api.getCompanyBranding().subscribe({
      next: (b) => {
        if (b?.clientName) this.companyName = b.clientName;
        if (b?.logoUrl) this.companyLogoUrl = b.logoUrl;
      },
      error: () => {},
    });
  }

  /** Close avatar dropdown when clicking outside */
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.tb-avatar-wrap')) this.avatarOpen = false;
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  logout(): void {
    this.auth.logout('User clicked logout');
  }
}
