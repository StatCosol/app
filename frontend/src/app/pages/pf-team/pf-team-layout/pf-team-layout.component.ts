import { Component, HostListener , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-pf-team-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterModule],
  template: `
    <div class="shell" [class.sb-collapsed]="sidebarCollapsed" [class.sb-mobile-open]="mobileOpen">
      <!-- ==== SIDEBAR ==== -->
      <aside class="sidebar">
        <div class="sb-brand">
          <span class="sb-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
            </svg>
          </span>
          <span class="sb-brand-text">
            <strong>StatCo</strong>
            <small>PF &amp; ESI Helpdesk</small>
          </span>
        </div>

        <button class="sb-toggle desktop-only" (click)="toggleSidebar()" title="Toggle sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
        </button>

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

        <div class="sb-foot">
          <div class="sb-foot-info">
            <span class="sb-foot-name">{{ userName }}</span>
            <span class="sb-foot-role">PF &amp; ESI Team</span>
          </div>
          <div class="sb-foot-branding">
            <span class="sb-foot-branding-text">Designed &amp; Developed by StatCo Solutions</span>
            <a href="https://www.statcosol.com" target="_blank" rel="noopener noreferrer" class="sb-foot-branding-url">www.statcosol.com</a>
          </div>
        </div>
      </aside>

      <div class="overlay" *ngIf="mobileOpen" (click)="mobileOpen=false"></div>

      <div class="main-wrap">
        <header class="topbar">
          <button class="tb-hamburger mobile-only" (click)="mobileOpen=!mobileOpen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
          </button>
          <span class="tb-title mobile-only">PF &amp; ESI Helpdesk</span>
          <div class="tb-spacer"></div>

          <div class="tb-avatar-wrap" (click)="avatarOpen=!avatarOpen">
            <div class="tb-avatar">{{ initials }}</div>
            <svg class="tb-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
            <div class="dropdown" *ngIf="avatarOpen">
              <div class="dd-header">
                <strong>{{ userName }}</strong>
                <small>PF &amp; ESI Team</small>
              </div>
              <div class="dd-sep"></div>
              <button class="dd-item dd-danger" (click)="logout()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main class="page-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host { --sb-w: 248px; --sb-cw: 68px; --tb-h: 60px; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    .shell { display: flex; min-height: 100vh; background: #f4f6fa; }

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

    .sb-brand {
      display: flex; align-items: center; gap: 10px;
      padding: 18px 16px 14px; white-space: nowrap;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }
    .sb-logo { color: #60a5fa; flex-shrink: 0; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(96,165,250,.12); }
    .sb-brand-text { overflow: hidden; transition: opacity .2s; }
    .sb-brand-text strong { display: block; color: #fff; font-size: 14px; font-weight: 700; }
    .sb-brand-text small { color: rgba(255,255,255,.4); font-size: 11px; }
    .sb-collapsed .sb-brand-text { opacity: 0; width: 0; }

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

    .sb-collapsed .sb-link::after {
      content: attr(data-tip);
      position: absolute; left: calc(var(--sb-cw) - 8px); top: 50%; transform: translateY(-50%);
      background: #1e293b; color: #fff; font-size: 12px; font-weight: 500;
      padding: 5px 10px; border-radius: 6px; white-space: nowrap;
      pointer-events: none; opacity: 0; transition: opacity .15s;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
    }
    .sb-collapsed .sb-link:hover::after { opacity: 1; }

    .sb-foot {
      padding: 12px 14px;
      border-top: 1px solid rgba(255,255,255,.07);
      overflow: hidden;
    }
    .sb-foot-info { display: flex; flex-direction: column; }
    .sb-foot-name { color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-foot-role { color: rgba(255,255,255,.4); font-size: 11px; }
    .sb-foot-branding { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.06); }
    .sb-foot-branding-text { color: rgba(255,255,255,.55); font-size: 10px; font-weight: 500; }
    .sb-foot-branding-url { color: rgba(110,231,183,.85); font-size: 10px; text-decoration: none; }
    .sb-foot-branding-url:hover { color: rgba(167,243,208,1); text-decoration: underline; }
    .sb-collapsed .sb-foot { display: none; }

    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 35; }
    .main-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    .topbar {
      height: var(--tb-h); min-height: var(--tb-h);
      background: #fff; border-bottom: 1px solid #e5e7eb;
      display: flex; align-items: center;
      padding: 0 20px; gap: 12px;
      position: sticky; top: 0; z-index: 30;
    }
    .tb-spacer { flex: 1; }
    .tb-title { font-size: 16px; font-weight: 700; color: #0f172a; }
    .tb-hamburger, .mobile-only { display: none; }
    .tb-hamburger { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 8px; color: #374151; }
    .tb-hamburger:hover { background: #f3f4f6; }
    .tb-hamburger svg { width: 22px; height: 22px; }

    .tb-avatar-wrap {
      position: relative; display: flex; align-items: center; gap: 6px;
      cursor: pointer; padding: 4px 8px; border-radius: 10px; transition: background .15s;
    }
    .tb-avatar-wrap:hover { background: #f3f4f6; }
    .tb-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #4338ca);
      color: #fff; font-size: 14px; font-weight: 700;
      display: grid; place-items: center;
    }
    .tb-chev { width: 14px; height: 14px; color: #9ca3af; }

    .dropdown {
      position: absolute; right: 0; top: calc(100% + 6px);
      width: 220px; background: #fff; border: 1px solid #e5e7eb;
      border-radius: 12px; padding: 6px;
      box-shadow: 0 10px 30px rgba(0,0,0,.1); z-index: 100;
    }
    .dd-header { padding: 10px 12px 8px; border-bottom: 1px solid #f3f4f6; }
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

    .page-content { flex: 1; padding: 24px; overflow-y: auto; }

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
export class PfTeamLayoutComponent {
  userName = '';
  initials = '';
  sidebarCollapsed = false;
  mobileOpen = false;
  avatarOpen = false;

  navItems: NavItem[] = [
    {
      label: 'Dashboard',
      route: '/pf-team/dashboard',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>',
    },
    {
      label: 'Tickets',
      route: '/pf-team/tickets',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"/></svg>',
    },
  ];

  constructor(private auth: AuthService) {
    const u = this.auth.getUser();
    this.userName = u?.name || 'PF Team';
    this.initials = this.userName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
  }

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
