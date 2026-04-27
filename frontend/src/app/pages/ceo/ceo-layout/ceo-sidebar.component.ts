import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
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
  selector: 'app-ceo-sidebar',
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
          <span class="text-white font-bold text-xl tracking-tight">CEO</span>
          <span class="block text-white/40 text-[13px] font-medium">Executive Dashboard</span>
        </div>
      </div>
      <div *ngIf="collapsed" class="py-5 flex justify-center">
        <span class="text-white/80 text-xs font-semibold tracking-wide">CE</span>
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
                [routerLinkActiveOptions]="{ exact: item.route.endsWith('dashboard') }"
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
        <span class="text-[10px] text-white/35">CEO v1.0</span>
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
      background: linear-gradient(180deg, #0A3D1E 0%, #1A6B3D 100%);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 2px 0 16px rgba(10, 61, 30, 0.18);
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
      color: #E8FFF0;
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
      color: #B9ECCD;
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
      color: #CFF4DC;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      text-decoration: none;
    }

    .sidebar-item:hover {
      color: #FFFFFF;
      background: #1A5A35;
    }

    .sidebar-item.sidebar-active {
      color: #FFFFFF;
      background: #228B4F;
      font-weight: 600;
    }

    /* Glowing left indicator on active item */
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

    /* Collapsed menu */
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
      background: #228B4F;
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
      background: #1E293B;
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
      border-right-color: #1E293B;
    }

    .collapsed-icon:hover .collapsed-tooltip {
      opacity: 1;
    }
  `]
})
export class CeoSidebarComponent implements OnChanges, OnDestroy {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  @Input() navGroupsInput?: SidebarGroup[];
  @Input() collapsedLinksInput?: SidebarItem[];

  collapsedLinks: SidebarItem[] = [];
  navGroups: SidebarGroup[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {
    this.setNavData();
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['navGroupsInput'] || changes['collapsedLinksInput']) {
      this.setNavData();
      this.syncExpandedWithRoute(this.router.url);
    }
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

  private setNavData(): void {
    this.collapsedLinks = (this.collapsedLinksInput && this.collapsedLinksInput.length)
      ? this.collapsedLinksInput
      : this.defaultCollapsedLinks();

    this.navGroups = (this.navGroupsInput && this.navGroupsInput.length)
      ? this.navGroupsInput
      : this.defaultNavGroups();
  }

  private defaultCollapsedLinks(): SidebarItem[] {
    return [
      { label: 'Dashboard', route: '/ceo/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Approvals', route: '/ceo/approvals', icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
      { label: 'Escalations', route: '/ceo/escalations', icon: this.svg('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z') },
      { label: 'Oversight', route: '/ceo/oversight', icon: this.svg('M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z') },
      { label: 'Branches', route: '/ceo/branches', icon: this.svg('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4') },
      { label: 'Reports', route: '/ceo/reports', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { label: 'Registers', route: '/ceo/registers', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
      { label: 'Notifications', route: '/ceo/notifications', icon: this.svg('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
      { label: 'Profile', route: '/ceo/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
    ];
  }

  private defaultNavGroups(): SidebarGroup[] {
    return [
      {
        label: 'Overview',
        expanded: false,
        items: [
          { label: 'Dashboard', route: '/ceo/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
          { label: 'Notifications', route: '/ceo/notifications', icon: this.svg('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
        ],
      },
      {
        label: 'Governance',
        expanded: false,
        items: [
          { label: 'Approvals', route: '/ceo/approvals', icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
          { label: 'Escalations', route: '/ceo/escalations', icon: this.svg('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z') },
          { label: 'Oversight', route: '/ceo/oversight', icon: this.svg('M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z') },
          { label: 'Branches', route: '/ceo/branches', icon: this.svg('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4') },
        ],
      },
      {
        label: 'Intelligence',
        expanded: false,
        items: [
          { label: 'Reports', route: '/ceo/reports', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
          { label: 'Registers', route: '/ceo/registers', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
        ],
      },
      {
        label: 'Account',
        expanded: false,
        items: [
          { label: 'Profile', route: '/ceo/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
        ],
      },
    ];
  }

  private svg(d: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`
    );
  }
}
