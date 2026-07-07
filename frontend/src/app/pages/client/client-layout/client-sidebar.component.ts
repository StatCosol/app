import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject, of } from 'rxjs';
import { filter, takeUntil, catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { ClientPayrollSettingsService } from '../../../core/client-payroll-settings.service';

interface SidebarGroup {
  label: string;
  icon?: SafeHtml;
  items: SidebarItem[];
  expanded?: boolean;
  badge?: number;
}

interface SidebarItem {
  label: string;
  route: string;
  icon: SafeHtml;
  exact?: boolean;
  badge?: number;
  badgeColor?: 'red' | 'amber' | 'blue';
  tag?: string;
}

@Component({
  selector: 'app-client-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
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
      <div *ngIf="!collapsed" class="px-4 pt-5 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-4.5 h-4.5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div>
            <span class="text-white font-bold text-[17px] tracking-tight">LegitX</span>
            <span class="block text-white/40 text-[11px] font-medium">Client Compliance Platform</span>
          </div>
        </div>
        <!-- Sidebar search filter -->
        <div class="mt-3 relative">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Filter navigation…"
            [(ngModel)]="searchTerm"
            class="sidebar-search w-full pl-8 pr-3 py-1.5 text-[12px] bg-white/8 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:bg-white/12 focus:border-white/20 transition-all"
          />
        </div>
      </div>
      <div *ngIf="collapsed" class="py-4 flex flex-col items-center gap-1">
        <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <svg class="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <span class="text-white/60 text-[10px] font-bold tracking-widest">LX</span>
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
              [attr.href]="link.route"
              [class.collapsed-active]="isActiveRoute(link, true)"
              (click)="navigateTo(link.route, $event)"
              class="collapsed-icon"
            >
              <span class="sidebar-icon" [innerHTML]="link.icon"></span>
              <span class="collapsed-tooltip">{{ link.label }}</span>
            </a>
          </div>
        </ng-container>

        <ng-template #expandedNav>
          <div
            *ngFor="let group of filteredNavGroups"
          >
            <div
              class="sidebar-section"
              [class.active]="group.expanded"
              (click)="toggleGroup(group)"
            >
              <span class="sidebar-section-icon" *ngIf="group.icon" [innerHTML]="group.icon"></span>
              <span class="section-label">{{ group.label }}</span>
              <span *ngIf="group.badge" class="section-badge">{{ group.badge }}</span>
              <svg class="chevron" [class.open]="group.expanded" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div class="space-y-0.5 sidebar-submenu" [style.display]="group.expanded ? 'block' : 'none'">
              <a
                *ngFor="let item of group.items"
                [attr.href]="item.route"
                [class.sidebar-active]="isActiveRoute(item)"
                (click)="navigateTo(item.route, $event)"
                class="sidebar-item"
              >
                <span class="sidebar-icon" [innerHTML]="item.icon"></span>
                <span class="sidebar-label">{{ item.label }}</span>
                <span *ngIf="item.tag" class="item-tag">{{ item.tag }}</span>
                <span
                  *ngIf="item.badge"
                  class="item-badge"
                  [class.item-badge--red]="item.badgeColor === 'red'"
                  [class.item-badge--amber]="item.badgeColor === 'amber'"
                  [class.item-badge--blue]="item.badgeColor === 'blue' || !item.badgeColor"
                >{{ item.badge }}</span>
              </a>
            </div>
          </div>
        </ng-template>
      </nav>

      <!-- Version footer -->
      <div *ngIf="!collapsed" class="px-4 py-3 border-t border-white/8 text-center space-y-0.5">
        <div class="text-[10px] text-white/35">LegitX v1.0</div>
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
      background: #1A486F;
    }

    .sidebar-item.sidebar-active {
      color: #FFFFFF;
      background: #2267AD;
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
      background: #12A8E8;
      box-shadow: 0 0 10px rgba(18, 168, 232, 0.6);
    }

    /* Item badges */
    .item-badge {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: rgba(18,168,232,0.25);
      color: #7DD3F8;
    }
    .item-badge--red { background: rgba(239,68,68,0.25); color: #FCA5A5; }
    .item-badge--amber { background: rgba(245,158,11,0.25); color: #FCD34D; }
    .item-badge--blue { background: rgba(18,168,232,0.25); color: #7DD3F8; }
    .item-tag {
      margin-left: auto;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(16,185,129,0.2);
      color: #6EE7B7;
      text-transform: uppercase;
    }
    .section-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: rgba(239,68,68,0.3);
      color: #FCA5A5;
      margin-right: 4px;
    }
    .sidebar-section-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: #B9D2EC;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .sidebar-section-icon svg { width: 14px; height: 14px; stroke: currentColor; }
    .sidebar-search {
      background: rgba(255,255,255,0.06) !important;
      border: 1px solid rgba(255,255,255,0.10) !important;
      color: #e2e8f0;
    }
    .sidebar-search::placeholder { color: rgba(255,255,255,0.28); }

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
      background: #2267AD;
      color: #FFFFFF;
      box-shadow: inset 2px 0 0 #12A8E8;
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
export class ClientSidebarComponent implements OnInit, OnChanges, OnDestroy {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  @Input() navGroupsInput?: SidebarGroup[];
  @Input() collapsedLinksInput?: SidebarItem[];

  collapsedLinks: SidebarItem[] = [];
  navGroups: SidebarGroup[] = [];
  searchTerm = '';

  get filteredNavGroups(): SidebarGroup[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) return this.navGroups;
    return this.navGroups
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0)
      .map(g => ({ ...g, expanded: true }));
  }

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private sanitizer: DomSanitizer,
    private auth: AuthService,
    private payrollSettings: ClientPayrollSettingsService,
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

  ngOnInit(): void {
    // For branch users, check if master has granted payroll access
    if (this.auth.isBranchUser() && this.auth.hasModule('PAYROLL')) {
      this.payrollSettings.get().pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
      ).subscribe(settings => {
        if (!settings?.allowBranchPayrollAccess) {
          this.hidePayrollSection();
        }
      });
    }
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

  onNavClick(): void {
    // Only close the mobile drawer here. Group expand/collapse is handled by
    // syncExpandedWithRoute() on NavigationEnd, which keeps the active group
    // open for the page that just loaded. (Previously this collapsed all
    // groups via setTimeout, which fired AFTER NavigationEnd and visually
    // closed the just-clicked group, making users think nothing happened
    // and click again — the "two clicks needed" bug.)
    if (this.mobileOpen) {
      setTimeout(() => {
        this.mobileOpen = false;
        this.mobileOpenChange.emit(false);
      });
    }
  }

  navigateTo(route: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    void this.router.navigateByUrl(route).then(() => {
      this.onNavClick();
    });
  }

  isActiveRoute(item: SidebarItem, forceExact = false): boolean {
    const url = this.normalizeRoute(this.router.url);
    const route = this.normalizeRoute(item.route);
    const exact = forceExact || item.exact || item.route.endsWith('dashboard');
    return exact ? url === route : url === route || url.startsWith(`${route}/`);
  }

  private syncExpandedWithRoute(url: string): void {
    let matched = false;
    this.navGroups.forEach(g => {
      const match = g.items.some(item => this.routeMatches(url, item));
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

    // Hide branch-only monthly uploads for master users.
    if (this.auth.isMasterUser()) {
      this.navGroups = this.navGroups.map(g => ({
        ...g,
        items: g.items.filter(i => i.route !== '/client/compliance/mcd'),
      }));
      this.collapsedLinks = this.collapsedLinks.filter(i => i.route !== '/client/compliance/mcd');
    }

    this.applyModuleAccess();
  }

  private applyModuleAccess(): void {
    if (!this.auth.getServicePackage()) return;

    const isAllowed = (route: string) => {
      const module = this.moduleForRoute(route);
      return !module || this.auth.hasAnyModule(module);
    };

    this.navGroups = this.navGroups
      .map(g => ({ ...g, items: g.items.filter(i => isAllowed(i.route)) }))
      .filter(g => g.items.length > 0);
    this.collapsedLinks = this.collapsedLinks.filter(i => isAllowed(i.route));
  }

  private moduleForRoute(route: string): string[] | null {
    if (route === '/client/dashboard') return ['EMPLOYEE_COMPLIANCE'];
    if (route === '/client/profile' || route.startsWith('/client/queries')) return null;
    if (route.startsWith('/client/contractors')) return ['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS'];
    if (route.startsWith('/client/audits') || route.startsWith('/client/audit-summaries')) return ['CONTRACTOR_AUDIT'];
    if (route.startsWith('/client/branches')) {
      return [
        'EMPLOYEE_COMPLIANCE',
        'CONTRACTOR_AUDIT',
        'CONTRACTOR_DOCUMENTS',
        'MOBILE_ATTENDANCE',
        'CONTRACTOR_FACE_ATTENDANCE',
      ];
    }
    if (route.startsWith('/client/mobile-attendance') || route.startsWith('/client/face-failures') || route.startsWith('/client/facedesk')) return ['MOBILE_ATTENDANCE', 'CONTRACTOR_FACE_ATTENDANCE'];
    if (route.startsWith('/client/payroll') || route.startsWith('/client/ctc-summary') || route.startsWith('/client/registers')) return ['PAYROLL'];
    if (route.startsWith('/client/employees') || route.startsWith('/client/master-data')) return ['EMPLOYEE_COMPLIANCE'];
    if (route.startsWith('/client/attendance') || route.startsWith('/client/biometric')) return ['EMPLOYEE_ATTENDANCE'];
    if (route.startsWith('/client/appraisal') || route.startsWith('/client/appraisals')) return ['APPRAISAL'];
    if (route.startsWith('/client/compliance') || route.startsWith('/client/branch-compliance') || route.startsWith('/client/safety') || route.startsWith('/client/returns') || route.startsWith('/client/renewals') || route.startsWith('/client/calendar') || route.startsWith('/client/reminders') || route.startsWith('/client/heatmap') || route.startsWith('/client/sla') || route.startsWith('/client/risk-trend') || route.startsWith('/client/escalations') || route.startsWith('/client/notices')) return ['EMPLOYEE_COMPLIANCE'];
    if (route.startsWith('/client/approvals') || route.startsWith('/client/settings')) return ['EMPLOYEE_COMPLIANCE'];
    return null;
  }

  /** Remove the Payroll group from sidebar (called when branch user lacks payroll access) */
  private hidePayrollSection(): void {
    this.navGroups = this.navGroups.filter(g =>
      !g.items.some(i => i.route === '/client/payroll')
    );
    this.collapsedLinks = this.collapsedLinks.filter(i => i.route !== '/client/payroll');
  }

  private defaultCollapsedLinks(): SidebarItem[] {
    return [
      { label: 'Overview', route: '/client/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Compliance', route: '/client/compliance/status', icon: this.svg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
      { label: 'Risk', route: '/client/heatmap', icon: this.svg('M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z') },
      { label: 'Payroll', route: '/client/payroll', icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
      { label: 'Company', route: '/client/branches', icon: this.svg('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4') },
      { label: 'Governance', route: '/client/approvals', icon: this.svg('M3 7h18M6 3h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z') },
      { label: 'Support', route: '/client/queries', icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
      { label: 'Accounts', route: '/client/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
    ];
  }

  private defaultNavGroups(): SidebarGroup[] {
    return [
      {
        label: 'Overview',
        expanded: false,
        items: [
          { label: 'Dashboard', route: '/client/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
        ],
      },
      {
        label: 'Compliance',
        expanded: false,
        items: [
          { label: 'Compliance Status', route: '/client/compliance/status', icon: this.svg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
          { label: 'Upload Status', route: '/client/branch-compliance', icon: this.svg('M9 12h6m-6 4h6M7 20h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z') },
          { label: 'Safety', route: '/client/safety', icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
          { label: 'Returns / Filings', route: '/client/compliance/returns', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Returns Summary', route: '/client/returns-summary', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
          { label: 'Returns Status', route: '/client/returns-status', icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01') },
          { label: 'Registrations & Licenses', route: '/client/compliance/registrations', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Renewals', route: '/client/renewals', icon: this.svg('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15') },
          { label: 'Renewals Status', route: '/client/renewals-status', icon: this.svg('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15') },
          { label: 'Monthly Uploads', route: '/client/compliance/mcd', icon: this.svg('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12') },
          { label: 'Compliance Documents', route: '/client/compliance/library', icon: this.svg('M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4') },
          { label: 'Audits', route: '/client/audits', icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4') },
          { label: 'Audit Summaries', route: '/client/audit-summaries', icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
        ],
      },
      {
        label: 'Risk & Monitoring',
        expanded: false,
        items: [
          { label: 'Compliance Calendar', route: '/client/calendar', icon: this.svg('M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
          { label: 'Compliance Reminders', route: '/client/reminders', icon: this.svg('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
          { label: 'Risk Heatmap', route: '/client/heatmap', icon: this.svg('M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z') },
          { label: 'SLA Tracker', route: '/client/sla', icon: this.svg('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z') },
          { label: 'Risk Trend', route: '/client/risk-trend', icon: this.svg('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6') },
          { label: 'Escalations', route: '/client/escalations', icon: this.svg('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z') },
          { label: 'Notices', route: '/client/notices', icon: this.svg('M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z') },
        ],
      },
      {
        label: 'Payroll & Workforce',
        expanded: false,
        items: [
          { label: 'Payroll', route: '/client/payroll', icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
          { label: 'Employees', route: '/client/employees', icon: this.svg('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z') },
          { label: 'Registers', route: '/client/registers', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Attendance Review', route: '/client/attendance', exact: true, icon: this.svg('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
          { label: 'Daily Attendance', route: '/client/attendance/daily', icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4') },
          { label: 'Biometric Devices', route: '/client/biometric', icon: this.svg('M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4') },
          { label: 'Mobile Attendance', route: '/client/mobile-attendance', icon: this.svg('M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z') },
          { label: 'FaceDesk', route: '/client/facedesk', icon: this.svg('M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM12 3a9 9 0 100 18 9 9 0 000-18z') },
          { label: 'Face Failures', route: '/client/face-failures', icon: this.svg('M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z') },
          { label: 'Master Data', route: '/client/master-data', icon: this.svg('M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4') },
          { label: 'CTC Summary', route: '/client/ctc-summary', icon: this.svg('M9 7h6m-5 4h4m-3 4h2M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z') },
        ],
      },
      {
        label: 'Company',
        expanded: false,
        items: [
          { label: 'Branches', route: '/client/branches', icon: this.svg('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4') },
          { label: 'Contractors', route: '/client/contractors', icon: this.svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z') },
        ],
      },
      {
        label: 'Governance',
        expanded: false,
        items: [
          { label: 'Approvals Center', route: '/client/approvals', icon: this.svg('M3 7h18M6 3h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z') },
          { label: 'Appraisal Dashboard',  route: '/client/appraisal-dashboard', icon: this.svg('M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z') },
          { label: 'Appraisals', route: '/client/appraisals',          icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2') },
          { label: 'Cycles',     route: '/client/appraisal-cycles',    icon: this.svg('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15') },
          { label: 'Reports',    route: '/client/appraisal-reports',   icon: this.svg('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
        ],
      },
      {
        label: 'Support',
        expanded: false,
        items: [
          { label: 'My Queries', route: '/client/queries', icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
        ],
      },
      {
        label: 'Accounts',
        expanded: false,
        items: [
          { label: 'Profile', route: '/client/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
          { label: 'Access Settings', route: '/client/settings/access', icon: this.svg('M12 11c0 1.657-1.343 3-3 3S6 12.657 6 11s1.343-3 3-3 3 1.343 3 3zm9 1a8.96 8.96 0 01-.5 3l2.2 1.7-2 3.464-2.6-1a9.1 9.1 0 01-2.6 1.5l-.4 2.8H9.9l-.4-2.8a9.1 9.1 0 01-2.6-1.5l-2.6 1-2-3.464L4.5 15A8.96 8.96 0 014 12c0-1.04.18-2.04.5-3L2.3 7.3l2-3.464 2.6 1A9.1 9.1 0 019.5 3.3L9.9.5h4.2l.4 2.8a9.1 9.1 0 012.6 1.5l2.6-1 2 3.464L20.5 9c.32.96.5 1.96.5 3z') },
        ],
      },
    ];
  }

  private svg(d: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`
    );
  }

  private routeMatches(url: string, item: SidebarItem): boolean {
    const current = this.normalizeRoute(url);
    const route = this.normalizeRoute(item.route);
    const exact = item.exact || item.route.endsWith('dashboard');
    return exact ? current === route : current === route || current.startsWith(`${route}/`);
  }

  private normalizeRoute(route: string): string {
    return route.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  }
}
