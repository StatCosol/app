import { Component, Input, Output, EventEmitter, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject, of } from 'rxjs';
import { filter, takeUntil, catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { BranchComplianceDocService, SidebarBadges } from '../../../core/branch-compliance-doc.service';

interface SidebarItem {
  label: string;
  route: string;
  icon: SafeHtml;
  badge?: number;
  children?: SidebarItem[];
  expanded?: boolean;
}

@Component({
  selector: 'app-branch-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Mobile overlay -->
    <div
      *ngIf="mobileOpen"
      class="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm transition-opacity"
      (click)="closeMobile()"
    ></div>

    <!-- Sidebar -->
    <aside
      [class]="sidebarClasses"
      [class.translate-x-0]="mobileOpen"
      [class.-translate-x-full]="!mobileOpen"
    >
      <!-- Brand area -->
      <div *ngIf="!collapsed" class="px-5 pt-6 pb-4 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div>
          <span class="text-white font-bold text-lg tracking-tight">BranchDesk</span>
          <span class="block text-white/40 text-[12px] font-medium">Compliance Execution Portal</span>
        </div>
      </div>
      <div *ngIf="collapsed" class="py-5 flex justify-center">
        <span class="text-white/80 text-xs font-semibold tracking-wide">BD</span>
      </div>

      <!-- Collapse toggle (desktop only) -->
      <button
        class="sidebar-toggle hidden lg:flex"
        (click)="toggleCollapse()"
        [title]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path [attr.d]="collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <!-- Mobile close button -->
      <div class="flex lg:hidden items-center justify-end px-4 py-3">
        <button (click)="closeMobile()" class="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav flex-1 py-4 px-3 space-y-1">
        <ng-container *ngIf="collapsed; else expandedNav">
          <div class="collapsed-menu">
            <ng-container *ngFor="let link of navItems">
              <a
                *ngIf="!link.children"
                [routerLink]="link.route"
                routerLinkActive="collapsed-active"
                [routerLinkActiveOptions]="{ exact: link.route.endsWith('dashboard') }"
                (click)="onNavClick()"
                class="collapsed-icon"
                [title]="link.label"
              >
                <span class="sidebar-icon" [innerHTML]="link.icon"></span>
                <span *ngIf="link.badge" class="badge-dot">{{ link.badge }}</span>
              </a>
              <ng-container *ngIf="link.children">
                <a
                  *ngFor="let child of link.children"
                  [routerLink]="child.route"
                  routerLinkActive="collapsed-active"
                  (click)="onNavClick()"
                  class="collapsed-icon"
                  [title]="child.label"
                >
                  <span class="sidebar-icon" [innerHTML]="child.icon"></span>
                  <span *ngIf="child.badge" class="badge-dot">{{ child.badge }}</span>
                </a>
              </ng-container>
            </ng-container>
          </div>
        </ng-container>

        <ng-template #expandedNav>
          <ng-container *ngFor="let item of navItems">
            <!-- Regular nav item (no children) -->
            <a
              *ngIf="!item.children"
              [routerLink]="item.route"
              routerLinkActive="sidebar-active"
              [routerLinkActiveOptions]="{ exact: item.route.endsWith('dashboard') }"
              (click)="onNavClick()"
              class="sidebar-item"
            >
              <span class="sidebar-icon" [innerHTML]="item.icon"></span>
              <span class="sidebar-label">{{ item.label }}</span>
              <span *ngIf="item.badge" class="badge-pill">{{ item.badge }}</span>
            </a>

            <!-- Collapsible group (has children) -->
            <div *ngIf="item.children" class="sidebar-group">
              <button class="sidebar-item sidebar-group-toggle" (click)="toggleGroup(item)">
                <span class="sidebar-icon" [innerHTML]="item.icon"></span>
                <span class="sidebar-label">{{ item.label }}</span>
                <span *ngIf="totalBadge(item)" class="badge-pill badge-pill--red">{{ totalBadge(item) }}</span>
                <svg class="w-4 h-4 ml-auto transition-transform" [class.rotate-90]="item.expanded" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
              <div class="sidebar-children" [class.sidebar-children--open]="item.expanded">
                <a
                  *ngFor="let child of item.children"
                  [routerLink]="child.route"
                  routerLinkActive="sidebar-active"
                  (click)="onNavClick()"
                  class="sidebar-item sidebar-child"
                >
                  <span class="sidebar-icon" [innerHTML]="child.icon"></span>
                  <span class="sidebar-label">{{ child.label }}</span>
                  <span *ngIf="child.badge" class="badge-pill badge-pill--red">{{ child.badge }}</span>
                </a>
              </div>
            </div>
          </ng-container>
        </ng-template>
      </nav>

      <!-- Version footer -->
      <div *ngIf="!collapsed" class="px-4 py-3 border-t border-white/8 text-center">
        <span class="text-[10px] text-white/35">BranchDesk v1.0</span>
      </div>
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .sidebar-nav {
      overflow-y: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .sidebar-nav::-webkit-scrollbar { width: 0; height: 0; }

    .sidebar-dark {
      background: linear-gradient(180deg, #0D3558 0%, #144B7A 100%);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 2px 0 16px rgba(12, 47, 83, 0.18);
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
      color: #E8F2FF;
      padding: 0;
    }
    .sidebar-toggle:hover {
      background: rgba(255, 255, 255, 0.14);
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateX(1px);
    }
    .toggle-icon { width: 16px; height: 16px; color: inherit; stroke: currentColor; }

    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 10px 14px;
      border-radius: 0.75rem;
      font-size: 13px;
      font-weight: 500;
      color: #CFE0F4;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      text-decoration: none;
    }
    .sidebar-item:hover { color: #FFFFFF; background: #1A486F; }
    .sidebar-item.sidebar-active {
      color: #FFFFFF;
      background: #2267AD;
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
      background: #10b981;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
    }
    .sidebar-item.sidebar-active .sidebar-icon { color: #FFFFFF; }

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
    .sidebar-icon svg { width: 20px; height: 20px; stroke: currentColor; }
    .sidebar-item:hover .sidebar-icon { color: #FFFFFF; }
    .sidebar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Collapsed menu */
    .collapsed-menu {
      display: grid;
      grid-auto-rows: minmax(44px, auto);
      gap: 8px;
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
    .collapsed-icon:hover { background: rgba(255, 255, 255, 0.08); }
    .collapsed-active {
      background: #2267AD;
      color: #FFFFFF;
      box-shadow: inset 2px 0 0 #10b981;
    }
    .collapsed-active .sidebar-icon { color: #FFFFFF; }

    /* Badge styles */
    .badge-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: rgba(255,255,255,0.12);
      color: #CFE0F4;
      margin-left: auto;
    }
    .badge-pill--red {
      background: #ef4444;
      color: #fff;
    }
    .badge-dot {
      position: absolute;
      top: 4px;
      right: 4px;
      min-width: 16px;
      height: 16px;
      padding: 0 3px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 700;
      background: #ef4444;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Collapsible group */
    .sidebar-group { margin-bottom: 2px; }
    .sidebar-group-toggle {
      width: 100%;
      border: none;
      text-align: left;
    }
    .sidebar-children {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .sidebar-children--open {
      max-height: 400px;
    }
    .sidebar-child {
      padding-left: 2.5rem;
      font-size: 12.5px;
    }
  `]
})
export class BranchSidebarComponent implements OnInit, OnDestroy {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  navItems: SidebarItem[] = [];
  private badges: SidebarBadges | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private sanitizer: DomSanitizer,
    private auth: AuthService,
    private complianceDocs: BranchComplianceDocService,
  ) {
    this.navItems = this.buildNav();
  }

  ngOnInit(): void {
    this.loadBadges();

    // Auto-expand compliance group if currently on a compliance route
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => this.autoExpandCompliance());

    this.autoExpandCompliance();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Load sidebar badge counts from API */
  private loadBadges(): void {
    const ids = this.auth.getBranchIds();
    const branchId = ids.length ? String(ids[0]) : '';
    if (!branchId) return;

    this.complianceDocs
      .getSidebarBadges({ branchId, year: new Date().getFullYear() })
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe((badges) => {
        if (!badges) return;
        this.badges = badges;
        this.applyBadges();
      });
  }

  /** Apply badge counts to compliance nav items */
  private applyBadges(): void {
    if (!this.badges) return;
    const complianceGroup = this.navItems.find(i => i.children);
    if (!complianceGroup?.children) return;

    // Compute aggregate compliance badge from all frequencies
    let totalBadges = 0;
    for (const key of ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const) {
      const b = this.badges[key as keyof SidebarBadges];
      if (b) totalBadges += b.overdue + b.reupload;
    }

    // Apply aggregate badge to Monthly Uploads child
    const uploadsChild = complianceGroup.children.find(c => c.route.endsWith('/monthly-uploads'));
    if (uploadsChild) {
      uploadsChild.badge = totalBadges > 0 ? totalBadges : undefined;
    }
  }

  /** Auto-expand compliance group when on a compliance route */
  private autoExpandCompliance(): void {
    const url = this.router.url;
    const complianceGroup = this.navItems.find(i => i.children);
    if (complianceGroup && (url.includes('/branch/compliance') || url.includes('/branch/uploads'))) {
      complianceGroup.expanded = true;
    }
  }

  /** Toggle a collapsible group */
  toggleGroup(item: SidebarItem): void {
    item.expanded = !item.expanded;
  }

  /** Sum all badges for a group */
  totalBadge(item: SidebarItem): number {
    if (!item.children) return 0;
    return item.children.reduce((sum, c) => sum + (c.badge || 0), 0);
  }

  get sidebarClasses(): string {
    const base = 'fixed lg:sticky top-0 left-0 z-50 lg:z-30 h-screen sidebar-dark flex flex-col transition-all duration-300 ease-in-out relative';
    const width = this.collapsed ? 'lg:w-[68px]' : 'lg:w-60';
    return `${base} w-64 ${width} lg:translate-x-0`;
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }

  closeMobile(): void {
    this.mobileOpen = false;
    this.mobileOpenChange.emit(false);
  }

  onNavClick(): void {
    if (this.mobileOpen) {
      this.closeMobile();
    }
  }

  private buildNav(): SidebarItem[] {
    return [
      { label: 'Dashboard',              route: '/branch/dashboard',           icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Employees',              route: '/branch/employees',           icon: this.svg('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z') },
      { label: 'Contractors',            route: '/branch/contractors',         icon: this.svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z') },
      {
        label: 'Compliance',
        route: '',
        icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'),
        expanded: false,
        children: [
          { label: 'Branch Compliance',    route: '/branch/compliance',              icon: this.svg('M9 12h6m-6 4h6M7 20h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z') },
          { label: 'Monthly Uploads',      route: '/branch/monthly-uploads',         icon: this.svg('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12') },
          { label: 'Periodic Uploads',     route: '/branch/uploads',                 icon: this.svg('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12') },
          { label: 'Registrations',        route: '/branch/registrations',           icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Compliance Calendar',  route: '/branch/calendar',                icon: this.svg('M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
          { label: 'SLA Tracker',          route: '/branch/sla',                     icon: this.svg('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z') },
          { label: 'Escalations',          route: '/branch/escalations',             icon: this.svg('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z') },
          { label: 'Audit Observations',   route: '/branch/audit-observations',      icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2') },
          { label: 'Safety',               route: '/branch/safety',                  icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
        ],
      },
      { label: 'Documents',              route: '/branch/documents',           icon: this.svg('M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z') },
      { label: 'Reports',                route: '/branch/reports',             icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { label: 'Notifications',          route: '/branch/notifications',       icon: this.svg('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
      { label: 'Helpdesk',               route: '/branch/helpdesk',            icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
    ];
  }

  private svg(d: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`
    );
  }
}
