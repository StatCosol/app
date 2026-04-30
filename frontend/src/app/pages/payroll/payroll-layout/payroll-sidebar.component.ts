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
  selector: 'app-payroll-sidebar',
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
          <span class="text-white font-bold text-xl tracking-tight">PayDek</span>
          <span class="block text-white/40 text-[13px] font-medium">Payroll Management</span>
        </div>
      </div>
      <div *ngIf="collapsed" class="py-5 flex justify-center">
        <span class="text-white/80 text-xs font-semibold tracking-wide">PD</span>
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
      <div *ngIf="!collapsed" class="px-4 py-3 border-t border-white/8 text-center space-y-0.5">
        <div class="text-[10px] text-white/35">PayDek v2.0</div>
        <div class="text-[10px] text-white/55 font-medium">Designed &amp; Developed by StatCo Solutions</div>
        <a href="https://www.statcosol.com" target="_blank" rel="noopener noreferrer" class="text-[10px] text-emerald-300/80 hover:text-emerald-200">www.statcosol.com</a>
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
      background: linear-gradient(180deg, #1E293B 0%, #334155 100%);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 2px 0 16px rgba(30, 41, 59, 0.18);
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
      color: #B9D2EC;
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
      color: #CFE0F4;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      text-decoration: none;
    }

    .sidebar-item:hover {
      color: #FFFFFF;
      background: #3B4F6B;
    }

    .sidebar-item.sidebar-active {
      color: #FFFFFF;
      background: #475569;
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
      background: #38BDF8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
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
      background: #475569;
      color: #FFFFFF;
      box-shadow: inset 2px 0 0 #38BDF8;
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
export class PayrollSidebarComponent implements OnChanges, OnDestroy {
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
    this.setNavData(this.router.url);
    this.syncExpandedWithRoute(this.router.url);
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(this.destroy$),
    ).subscribe(evt => {
      const url = evt.urlAfterRedirects || evt.url;
      this.setNavData(url);
      this.syncExpandedWithRoute(url);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['navGroupsInput'] || changes['collapsedLinksInput']) {
      this.setNavData(this.router.url);
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

  private setNavData(url?: string): void {
    if (this.collapsedLinksInput?.length || this.navGroupsInput?.length) {
      this.collapsedLinks = this.collapsedLinksInput?.length ? this.collapsedLinksInput : this.defaultCollapsedLinks();
      this.navGroups = this.navGroupsInput?.length ? this.navGroupsInput : this.defaultNavGroups();
      return;
    }

    const clientId = this.extractClientId(url || '');
    if (clientId) {
      this.collapsedLinks = this.clientScopedCollapsedLinks(clientId);
      this.navGroups = this.clientScopedNavGroups(clientId);
    } else {
      this.collapsedLinks = this.defaultCollapsedLinks();
      this.navGroups = this.defaultNavGroups();
    }
  }

  private extractClientId(url: string): string | null {
    const match = url.match(/\/payroll\/clients\/([^/?]+)/);
    return match ? match[1] : null;
  }

  private clientScopedCollapsedLinks(clientId: string): SidebarItem[] {
    const b = `/payroll/clients/${clientId}`;
    return [
      { label: '← All Clients', route: '/payroll/clients', icon: this.svg('M10 19l-7-7m0 0l7-7m-7 7h18') },
      { label: 'Overview', route: `${b}/overview`, icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Employees', route: `${b}/employees`, icon: this.svg('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z') },
      { label: 'Payroll Runs', route: `${b}/runs`, icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
      { label: 'PF / ESI', route: `${b}/pf-esi`, icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4') },
      { label: 'Registers', route: `${b}/registers`, icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
      { label: 'F&F', route: `${b}/full-and-final`, icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
      { label: 'Queries', route: `${b}/queries`, icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
      { label: 'Setup', route: `${b}/setup`, icon: this.svg('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z') },
      { label: 'Rule Sets', route: `${b}/rule-sets`, icon: this.svg('M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10') },
      { label: 'Structures', route: `${b}/structures`, icon: this.svg('M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z') },
      { label: 'Client Config', route: `${b}/config`, icon: this.svg('M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4') },
    ];
  }

  private clientScopedNavGroups(clientId: string): SidebarGroup[] {
    const b = `/payroll/clients/${clientId}`;
    return [
      {
        label: 'Navigation',
        expanded: true,
        items: [
          { label: '← All Clients', route: '/payroll/clients', icon: this.svg('M10 19l-7-7m0 0l7-7m-7 7h18') },
          { label: 'Dashboard', route: '/payroll/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
        ],
      },
      {
        label: 'Client Workspace',
        expanded: true,
        items: [
          { label: 'Overview', route: `${b}/overview`, icon: this.svg('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z') },
          { label: 'Employees', route: `${b}/employees`, icon: this.svg('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z') },
        ],
      },
      {
        label: 'Payroll Operations',
        expanded: false,
        items: [
          { label: 'Payroll Runs', route: `${b}/runs`, icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
          { label: 'PF / ESI Compliance', route: `${b}/pf-esi`, icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4') },
          { label: 'Registers', route: `${b}/registers`, icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Full & Final', route: `${b}/full-and-final`, icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
        ],
      },
      {
        label: 'Communication',
        expanded: false,
        items: [
          { label: 'Queries', route: `${b}/queries`, icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
        ],
      },
      {
        label: 'Configuration',
        expanded: false,
        items: [
          { label: 'Payroll Setup', route: `${b}/setup`, icon: this.svg('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z') },
          { label: 'Rule Sets', route: `${b}/rule-sets`, icon: this.svg('M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10') },
          { label: 'Salary Structures', route: `${b}/structures`, icon: this.svg('M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z') },
          { label: 'Client Config', route: `${b}/config`, icon: this.svg('M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4') },
        ],
      },
      {
        label: 'Tools & Account',
        expanded: false,
        items: [
          { label: 'TDS Calculator', route: '/payroll/tds-calculator', icon: this.svg('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z') },
          { label: 'Gratuity Calculator', route: '/payroll/gratuity-calculator', icon: this.svg('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z') },
          { label: 'Reports', route: '/payroll/reports', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
          { label: 'Profile', route: '/payroll/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
        ],
      },
    ];
  }

  private defaultCollapsedLinks(): SidebarItem[] {
    return [
      { label: 'Dashboard', route: '/payroll/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Clients', route: '/payroll/clients', icon: this.svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z') },
      { label: 'TDS Calculator', route: '/payroll/tds-calculator', icon: this.svg('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z') },
      { label: 'Gratuity', route: '/payroll/gratuity-calculator', icon: this.svg('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z') },
      { label: 'Reports', route: '/payroll/reports', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { label: 'Profile', route: '/payroll/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
    ];
  }

  private defaultNavGroups(): SidebarGroup[] {
    return [
      {
        label: 'Overview',
        expanded: false,
        items: [
          { label: 'Dashboard', route: '/payroll/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
          { label: 'Clients', route: '/payroll/clients', icon: this.svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z') },
        ],
      },
      {
        label: 'Tools',
        expanded: false,
        items: [
          { label: 'TDS Calculator', route: '/payroll/tds-calculator', icon: this.svg('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z') },
          { label: 'Gratuity Calculator', route: '/payroll/gratuity-calculator', icon: this.svg('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z') },
        ],
      },
      {
        label: 'Analytics',
        expanded: false,
        items: [
          { label: 'Reports', route: '/payroll/reports', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
        ],
      },
      {
        label: 'Account',
        expanded: false,
        items: [
          { label: 'Profile', route: '/payroll/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
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
