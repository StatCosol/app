import { Component, OnInit, OnDestroy, HostListener , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router, NavigationEnd } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { EssApiService } from '../ess-api.service';

interface NavItem {
  label: string;
  route: string;
  icon: SafeHtml;
}

@Component({
  selector: 'app-ess-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterModule],
  template: `
    <div class="shell" [class.sb-collapsed]="sidebarCollapsed" [class.sb-mobile-open]="mobileOpen">
      <!-- ==== SIDEBAR ==== -->
      <aside class="sidebar">
        <!-- brand -->
        <div *ngIf="!sidebarCollapsed" class="px-5 pt-6 pb-4 flex items-center gap-3" style="border-bottom: 1px solid rgba(255,255,255,.07)">
          <div>
            <span class="text-white font-bold text-xl tracking-tight">{{ companyName }}</span>
            <span class="block text-white/40 text-[13px] font-medium">Employee Portal</span>
          </div>
        </div>
        <div *ngIf="sidebarCollapsed" class="py-5 flex justify-center" style="border-bottom: 1px solid rgba(255,255,255,.07)">
          <span class="text-white/80 text-xs font-semibold tracking-wide">EP</span>
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

        <!-- sidebar branding -->
        <div class="sb-branding">
          <span class="sb-branding-text">Designed &amp; Developed by</span>
          <a href="https://www.statcosol.com" target="_blank" rel="noopener noreferrer" class="sb-branding-link">StatCo Solutions</a>
          <a href="https://www.statcosol.com" target="_blank" rel="noopener noreferrer" class="sb-branding-url">www.statcosol.com</a>
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

          <!-- company logo -->
          <img *ngIf="companyLogoUrl" [src]="companyLogoUrl" alt="" class="tb-logo" />

          <div class="tb-spacer"></div>

          <!-- greeting + date -->
          <div class="tb-greeting desktop-only">
            <span class="tb-greeting-text">Welcome, {{ userName.split(' ')[0] }}</span>
            <span class="tb-date">{{ today }}</span>
          </div>

          <!-- helpline -->
          <div class="tb-helpline desktop-only">
            <div class="tb-hl-row">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="tb-hl-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
              <a href="tel:+919000607839" class="tb-hl-val">+91 9000607839</a>
            </div>
            <div class="tb-hl-row">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="tb-hl-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
              <a href="mailto:it_admin&#64;statcosol.com" class="tb-hl-val">it_admin&#64;statcosol.com</a>
            </div>
          </div>

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



    /* toggle */
    .sb-toggle {
      position: absolute; top: 72px; right: -10px;
      width: 26px; height: 32px; border-radius: 999px;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
      display: grid; place-items: center; cursor: pointer;
      z-index: 50; transition: background .2s, transform .2s;
      color: #e8f2ff;
    }
    :host ::ng-deep .sb-toggle svg { width: 14px; height: 14px; color: inherit; }
    .sb-toggle:hover { background: rgba(255,255,255,.16); }
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
    .sb-icon { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: visible; }
    :host ::ng-deep .sb-icon svg { width: 20px; height: 20px; display: block; flex-shrink: 0; }
    .sb-label { transition: opacity .2s, width .2s; }

    /* collapsed sidebar: icon-only mode */
    .sb-collapsed .sb-nav { padding: 10px 6px; gap: 4px; }
    .sb-collapsed .sb-link {
      justify-content: center; padding: 10px 0; gap: 0;
      border-radius: 10px; min-height: 42px;
    }
    .sb-collapsed .sb-link:hover { background: rgba(255,255,255,.10); }
    .sb-collapsed .sb-link.active { background: rgba(99,102,241,.25); }
    .sb-collapsed .sb-label { opacity: 0; width: 0; overflow: hidden; pointer-events: none; position: absolute; }
    .sb-collapsed .sb-icon { width: 22px; height: 22px; }
    :host ::ng-deep .sb-collapsed .sb-icon svg { width: 22px; height: 22px; }

    /* tooltip on collapsed */
    .sb-collapsed .sb-link::after {
      content: attr(data-tip);
      position: absolute; left: calc(var(--sb-cw) + 2px); top: 50%; transform: translateY(-50%);
      background: #1e293b; color: #fff; font-size: 12px; font-weight: 500;
      padding: 5px 12px; border-radius: 6px; white-space: nowrap;
      pointer-events: none; opacity: 0; transition: opacity .15s;
      box-shadow: 0 4px 12px rgba(0,0,0,.25);
      z-index: 60;
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

    /* sidebar branding */
    .sb-branding {
      padding: 10px 14px; text-align: center;
      border-top: 1px solid rgba(255,255,255,.07);
    }
    .sb-branding-text { display: block; font-size: 9px; color: rgba(255,255,255,.3); line-height: 1.4; }
    .sb-branding-link { display: block; font-size: 10px; color: rgba(255,255,255,.5); font-weight: 600; text-decoration: none; }
    .sb-branding-link:hover { color: #a5b4fc; }
    .sb-branding-url { display: block; font-size: 9px; color: rgba(255,255,255,.25); text-decoration: none; margin-top: 2px; }
    .sb-branding-url:hover { color: rgba(255,255,255,.5); }
    .sb-collapsed .sb-branding { display: none; }

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
    .tb-logo { height: 36px; width: auto; object-fit: contain; border-radius: 8px; }

    /* greeting + date */
    .tb-greeting { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .tb-greeting-text { font-size: 13px; font-weight: 600; color: #374151; }
    .tb-date { font-size: 11px; color: #9ca3af; font-weight: 500; }

    /* helpline */
    .tb-helpline { display: flex; flex-direction: column; gap: 2px; padding-left: 12px; border-left: 1px solid #e5e7eb; }
    .tb-hl-row { display: flex; align-items: center; gap: 5px; }
    .tb-hl-icon { width: 13px; height: 13px; color: #6366f1; flex-shrink: 0; }
    .tb-hl-val { font-size: 11px; font-weight: 500; color: #374151; text-decoration: none; }
    .tb-hl-val:hover { color: #6366f1; }

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
      .sb-label { opacity: 1 !important; width: auto !important; }
      .sb-foot { display: block !important; }
      .page-content { padding: 16px; }
    }
  `],
})
export class EssLayoutComponent implements OnInit, OnDestroy {
  userName = '';
  userCode = '';
  initials = '';
  companyName = 'Employee Desk';
  companyLogoUrl: string | null = null;
  sidebarCollapsed = false;
  mobileOpen = false;
  avatarOpen = false;
  pageTitle = 'Dashboard';
  today = '';
  private readonly destroy$ = new Subject<void>();

  private readonly pageTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    profile: 'My Profile',
    pf: 'My PF',
    esi: 'My ESI',
    nominations: 'Nominations',
    leave: 'Leave',
    attendance: 'Attendance',
    documents: 'Documents',
    payslips: 'Payslips',
    helpdesk: 'Helpdesk',
    appraisals: 'My Appraisals',
  };

  navItems: NavItem[] = [];

  private readonly iconSvgs: Record<string, string> = {
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>',
    profile: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>',
    pf: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg>',
    esi: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>',
    nominations: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/></svg>',
    leave: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>',
    attendance: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M15.75 3v1.5M3.75 6.75h16.5M4.5 6.75v12A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25v-12M8.25 11.25h.008v.008H8.25v-.008zm3.75 0h.008v.008H12v-.008zm3.75 0h.008v.008h-.008v-.008zm-7.5 3.75h.008v.008H8.25v-.008zm3.75 0h.008v.008H12v-.008z"/></svg>',
    documents: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v4.125A2.625 2.625 0 0116.875 21H7.125A2.625 2.625 0 014.5 18.375V5.625A2.625 2.625 0 017.125 3h5.379a2.625 2.625 0 011.856.769l4.371 4.371a2.625 2.625 0 01.769 1.856V14.25zM13.5 3v4.5a1.5 1.5 0 001.5 1.5h4.5"/></svg>',
    payslips: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>',
    helpdesk: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"/></svg>',
    appraisals: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>',
  };

  constructor(private auth: AuthService, private router: Router, private api: EssApiService, private sanitizer: DomSanitizer) {
    const u = this.auth.getUser();
    this.userName = u?.name || 'Employee';
    this.userCode = u?.employeeCode || u?.email || '';
    this.initials = this.userName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
    if (u?.clientName) {
      this.companyName = u.clientName;
    }
    // Use logo from login response immediately (before API call)
    if (u?.clientLogoUrl) {
      this.companyLogoUrl = this.auth.authenticateUrl(u.clientLogoUrl);
    }

    // Format today's date
    const now = new Date();
    this.today = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    // Set page title from current URL
    this.updatePageTitle(this.router.url);

    // Build navItems with sanitized SVG icons
    const s = (key: string) => this.sanitizer.bypassSecurityTrustHtml(this.iconSvgs[key]);
    this.navItems = [
      { label: 'Dashboard',   route: '/ess/dashboard',   icon: s('dashboard') },
      { label: 'My Profile',  route: '/ess/profile',     icon: s('profile') },
      { label: 'My PF',       route: '/ess/pf',          icon: s('pf') },
      { label: 'My ESI',      route: '/ess/esi',         icon: s('esi') },
      { label: 'Nominations', route: '/ess/nominations', icon: s('nominations') },
      { label: 'Leave',       route: '/ess/leave',       icon: s('leave') },
      { label: 'Attendance',  route: '/ess/attendance',   icon: s('attendance') },
      { label: 'Documents',   route: '/ess/documents',   icon: s('documents') },
      { label: 'Payslips',    route: '/ess/payslips',    icon: s('payslips') },
      { label: 'Helpdesk',    route: '/ess/helpdesk',    icon: s('helpdesk') },
      { label: 'Appraisals',  route: '/ess/appraisals',  icon: s('appraisals') },
    ];
  }

  ngOnInit(): void {
    // Track route changes for page title
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(e => this.updatePageTitle(e.urlAfterRedirects));

    this.api.getCompanyBranding()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (b) => {
          if (b?.clientName) this.companyName = b.clientName;
          if (b?.logoUrl) this.companyLogoUrl = this.auth.authenticateUrl(b.logoUrl);
        },
        error: () => {},
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  private updatePageTitle(url: string): void {
    const segment = url.split('/').pop()?.split('?')[0] || 'dashboard';
    this.pageTitle = this.pageTitles[segment] || 'Dashboard';
  }

  logout(): void {
    this.auth.logout('User clicked logout');
  }
}
