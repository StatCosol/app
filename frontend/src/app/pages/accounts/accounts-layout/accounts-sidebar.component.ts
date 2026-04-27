import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

interface SidebarGroup {
  label: string;
  items: SidebarItem[];
  expanded?: boolean;
}

interface SidebarItem {
  label: string;
  route: string;
  icon: SafeHtml;
}

@Component({
  selector: 'app-accounts-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Mobile overlay -->
    <div
      *ngIf="mobileOpen"
      class="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm transition-opacity"
      (click)="mobileOpen = false; mobileOpenChange.emit(false)"
    ></div>

    <!-- Sidebar -->
    <aside
      [class]="sidebarClasses"
      [class.mobile-open]="mobileOpen"
    >
      <!-- Brand area -->
      <div *ngIf="!collapsed" class="px-5 pt-6 pb-4 flex items-center gap-3">
        <div>
          <span class="text-white font-bold text-xl tracking-tight">Accounts</span>
          <span class="block text-white/40 text-[13px] font-medium">Accounts &amp; Billing</span>
        </div>
      </div>
      <div *ngIf="collapsed" class="py-5 flex justify-center">
        <span class="text-white/80 text-xs font-semibold tracking-wide">AC</span>
      </div>

      <!-- Collapse toggle (desktop only) -->
      <button
        class="sidebar-toggle hidden lg:flex"
        (click)="collapsed = !collapsed; collapsedChange.emit(collapsed)"
        [title]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path [attr.d]="collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <!-- Mobile close button -->
      <div class="flex lg:hidden items-center justify-end px-4 py-3">
        <button
          (click)="mobileOpen = false; mobileOpenChange.emit(false)"
          class="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Navigation groups -->
      <nav class="sidebar-nav flex-1 py-4 px-3 space-y-3">
        <ng-container *ngIf="collapsed; else expandedNav">
          <div class="collapsed-menu">
            <a
              *ngFor="let link of collapsedLinks"
              [routerLink]="link.route"
              routerLinkActive="collapsed-active"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="onNavClick()"
              class="collapsed-icon"
            >
              <span class="sidebar-icon" [innerHTML]="link.icon"></span>
              <span class="collapsed-tooltip">{{ link.label }}</span>
            </a>
          </div>
        </ng-container>

        <ng-template #expandedNav>
          <div
            *ngFor="let group of navGroups"
          >
            <div
              class="sidebar-section"
              [class.active]="group.expanded"
              (click)="toggleGroup(group)"
            >
              <span class="section-label">{{ group.label }}</span>
              <svg class="chevron" [class.open]="group.expanded" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div class="space-y-0.5 sidebar-submenu" [style.display]="group.expanded ? 'block' : 'none'">
              <a
                *ngFor="let item of group.items"
                [routerLink]="item.route"
                routerLinkActive="sidebar-active"
                [routerLinkActiveOptions]="{ exact: item.route.endsWith('dashboard') || item.route.endsWith('/invoices') }"
                (click)="onNavClick()"
                class="sidebar-item"
              >
                <span class="sidebar-icon" [innerHTML]="item.icon"></span>
                <span class="sidebar-label">{{ item.label }}</span>
              </a>
            </div>
          </div>
        </ng-template>
      </nav>

      <!-- Version footer -->
      <div *ngIf="!collapsed" class="px-4 py-3 border-t border-white/8 text-center">
        <span class="text-[10px] text-white/35">Accounts v1.0</span>
      </div>
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .sidebar-panel {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 50;
      height: 100vh;
      width: 16rem;
      transform: translateX(-100%);
      flex-shrink: 0;
      overflow: hidden;
    }

    .sidebar-panel.mobile-open {
      transform: translateX(0);
    }

    @media (min-width: 1024px) {
      .sidebar-panel {
        position: sticky;
        z-index: 30;
        width: 15rem;
        transform: none;
      }
      .sidebar-panel.is-collapsed {
        width: 68px;
      }
    }

    .sidebar-nav {
      overflow-y: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .sidebar-nav::-webkit-scrollbar {
      width: 0;
      height: 0;
    }

    .sidebar-dark {
      background: linear-gradient(180deg, #064E3B 0%, #065F46 100%);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 2px 0 16px rgba(6, 78, 59, 0.18);
    }

    .sidebar-toggle {
      position: absolute;
      top: 18px;
      right: -10px;
      width: 26px;
      height: 32px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
      z-index: 60;
      color: #E8F4FF;
      padding: 0;
    }

    .sidebar-toggle:hover {
      background: rgba(255, 255, 255, 0.14);
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateX(1px);
    }

    .toggle-icon {
      width: 16px;
      height: 16px;
      color: inherit;
      stroke: currentColor;
    }

    .sidebar-section {
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-start;
      padding: 9px 12px;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #A7F3D0;
      cursor: pointer;
      border-radius: 10px;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .sidebar-section:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .sidebar-section.active {
      color: #FFFFFF;
    }

    .section-label {
      flex: 1;
    }

    .chevron {
      color: #FFFFFF;
      transition: transform 0.25s ease;
      margin-left: 4px;
    }

    .chevron.open {
      transform: rotate(90deg);
    }

    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 8px 14px;
      border-radius: 0.75rem;
      font-size: 13px;
      font-weight: 500;
      color: #D1FAE5;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      text-decoration: none;
    }

    .sidebar-item:hover {
      color: #FFFFFF;
      background: #047857;
    }

    .sidebar-item.sidebar-active {
      color: #FFFFFF;
      background: #059669;
      font-weight: 600;
    }

    .sidebar-item.sidebar-active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 55%;
      border-radius: 4px;
      background: #34D399;
      box-shadow: 0 0 10px rgba(52, 211, 153, 0.6);
    }

    .sidebar-item.sidebar-active .sidebar-icon {
      color: #FFFFFF;
    }

    .sidebar-icon {
      width: 1.25rem;
      height: 1.25rem;
      flex-shrink: 0;
      color: #FFFFFF;
      transition: color 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .sidebar-icon svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
    }

    .sidebar-item:hover .sidebar-icon {
      color: #FFFFFF;
    }

    .sidebar-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sidebar-submenu {
      padding-left: 10px;
      margin-left: 4px;
      border-left: 1px solid rgba(255, 255, 255, 0.06);
    }

    .collapsed-menu {
      display: grid;
      grid-auto-rows: minmax(44px, auto);
      gap: 12px;
      justify-items: center;
      padding: 6px 0;
    }

    .collapsed-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: #FFFFFF;
      transition: background 0.15s ease, color 0.15s ease;
      position: relative;
    }

    .collapsed-icon:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .collapsed-active {
      background: #059669;
      color: #FFFFFF;
      box-shadow: inset 2px 0 0 #34D399;
    }

    .collapsed-active .sidebar-icon {
      color: #FFFFFF;
    }

    .collapsed-tooltip {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      background: #064E3B;
      color: #FFFFFF;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 6px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 100;
    }

    .collapsed-tooltip::before {
      content: '';
      position: absolute;
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      border: 5px solid transparent;
      border-right-color: #064E3B;
    }

    .collapsed-icon:hover .collapsed-tooltip {
      opacity: 1;
    }
  `]
})
export class AccountsSidebarComponent implements OnDestroy {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  collapsedLinks: SidebarItem[] = [];
  navGroups: SidebarGroup[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {
    this.collapsedLinks = this.defaultCollapsedLinks();
    this.navGroups = this.defaultNavGroups();
    this.syncExpandedWithRoute(this.router.url);
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(this.destroy$),
    ).subscribe(evt => {
      this.syncExpandedWithRoute(evt.urlAfterRedirects || evt.url);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get sidebarClasses(): string {
    const base = 'sidebar-panel sidebar-dark flex flex-col transition-all duration-300 ease-in-out';
    return this.collapsed ? `${base} is-collapsed` : base;
  }

  toggleGroup(group: SidebarGroup): void {
    const willExpand = !group.expanded;
    this.navGroups.forEach(g => g.expanded = false);
    group.expanded = willExpand;
  }

  openGroupOnHover(group: SidebarGroup): void {
    if (!this.isDesktop()) return;
    this.navGroups.forEach(g => g.expanded = false);
    group.expanded = true;
  }

  closeGroupOnLeave(group: SidebarGroup): void {
    if (!this.isDesktop()) return;
    group.expanded = false;
  }

  private isDesktop(): boolean {
    return typeof window !== 'undefined' && window.innerWidth >= 1024;
  }

  onNavClick(): void {
    this.navGroups.forEach(g => g.expanded = false);
    if (this.mobileOpen) {
      this.mobileOpen = false;
      this.mobileOpenChange.emit(false);
    }
  }

  private syncExpandedWithRoute(url: string): void {
    let matched = false;
    this.navGroups.forEach(g => {
      const match = g.items.some(item => url.startsWith(item.route));
      g.expanded = match;
      if (match) matched = true;
    });
    if (!matched) {
      this.navGroups.forEach(g => g.expanded = false);
    }
  }

  private svg(d: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`
    );
  }

  private defaultCollapsedLinks(): SidebarItem[] {
    return [
      { label: 'Dashboard', route: '/accounts/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Clients', route: '/accounts/clients', icon: this.svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z') },
      { label: 'Invoices', route: '/accounts/invoices', icon: this.svg('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { label: 'Payments', route: '/accounts/payments', icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
      { label: 'GST Summary', route: '/accounts/gst-summary', icon: this.svg('M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z') },
      { label: 'Email Logs', route: '/accounts/email-logs', icon: this.svg('M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z') },
      { label: 'Settings', route: '/accounts/settings', icon: this.svg('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z') },
    ];
  }

  private defaultNavGroups(): SidebarGroup[] {
    return [
      {
        label: 'Overview',
        expanded: false,
        items: [
          { label: 'Dashboard', route: '/accounts/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
          { label: 'Clients', route: '/accounts/clients', icon: this.svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z') },
        ],
      },
      {
        label: 'Billing',
        expanded: false,
        items: [
          { label: 'Invoices', route: '/accounts/invoices', icon: this.svg('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
          { label: 'Create Invoice', route: '/accounts/invoices/new', icon: this.svg('M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z') },
          { label: 'Payments', route: '/accounts/payments', icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
        ],
      },
      {
        label: 'Reports & Logs',
        expanded: false,
        items: [
          { label: 'GST Summary', route: '/accounts/gst-summary', icon: this.svg('M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z') },
          { label: 'Email Logs', route: '/accounts/email-logs', icon: this.svg('M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z') },
        ],
      },
      {
        label: 'Configuration',
        expanded: false,
        items: [
          { label: 'Settings', route: '/accounts/settings', icon: this.svg('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z') },
        ],
      },
    ];
  }
}
