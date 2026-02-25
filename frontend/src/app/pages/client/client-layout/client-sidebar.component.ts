import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';

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
  selector: 'app-client-sidebar',
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
      [class.translate-x-0]="mobileOpen"
      [class.-translate-x-full]="!mobileOpen"
    >
      <!-- Brand area -->
      <div *ngIf="!collapsed" class="px-5 pt-6 pb-4 flex items-center gap-3">
        <div>
          <span class="text-white font-bold text-xl tracking-tight">LegitX</span>
          <span class="block text-white/40 text-[13px] font-medium">Client Compliance Platform</span>
        </div>
      </div>
      <div *ngIf="collapsed" class="py-5 flex justify-center">
        <span class="text-white/80 text-xs font-semibold tracking-wide">LX</span>
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
              [title]="link.label"
            >
              <span class="sidebar-icon" [innerHTML]="link.icon"></span>
            </a>
          </div>
        </ng-container>

        <ng-template #expandedNav>
          <div
            *ngFor="let group of navGroups"
            (mouseenter)="openGroupOnHover(group)"
            (mouseleave)="closeGroupOnLeave(group)"
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
        <span class="text-[10px] text-white/35">LegitX v1.0</span>
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
  `]
})
export class ClientSidebarComponent implements OnChanges, OnDestroy {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  @Input() navGroupsInput?: SidebarGroup[];
  @Input() collapsedLinksInput?: SidebarItem[];

  collapsedLinks: SidebarItem[] = [];
  navGroups: SidebarGroup[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(private router: Router, private sanitizer: DomSanitizer, private auth: AuthService) {
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
    const base = 'fixed lg:sticky top-0 left-0 z-50 lg:z-30 h-screen sidebar-dark flex flex-col transition-all duration-300 ease-in-out relative';
    const width = this.collapsed ? 'lg:w-[68px]' : 'lg:w-60';
    return `${base} w-64 ${width} lg:translate-x-0`;
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
    // Keep it open while pointer moves into submenu; collapse handled on container leave
    group.expanded = false;
  }

  private isDesktop(): boolean {
    return typeof window !== 'undefined' && window.innerWidth >= 1024;
  }

  onNavClick(): void {
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

    // Hide MCD Uploads for master users (only branch users can upload)
    if (this.auth.isMasterUser()) {
      this.navGroups = this.navGroups.map(g => ({
        ...g,
        items: g.items.filter(i => i.label !== 'MCD Uploads'),
      }));
      this.collapsedLinks = this.collapsedLinks.filter(i => i.label !== 'MCD Uploads');
    }
  }

  private defaultCollapsedLinks(): SidebarItem[] {
    return [
      { label: 'Dashboard', route: '/client/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Compliance', route: '/client/compliance/status', icon: this.svg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
      { label: 'Payroll', route: '/client/payroll', icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
      { label: 'Company', route: '/client/branches', icon: this.svg('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4') },
      { label: 'Support', route: '/client/support', icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
      { label: 'Account', route: '/client/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
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
          { label: 'Monthly MCD', route: '/client/compliance/mcd', icon: this.svg('M4 6h16M4 10h16M4 14h10m-6 4h6') },
          { label: 'MCD Uploads', route: '/client/compliance/mcd/uploads', icon: this.svg('M12 4v16m8-8H4') },
          { label: 'Returns / Filings', route: '/client/compliance/returns', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Registrations & Licenses', route: '/client/compliance/registrations', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
          { label: 'Document Library', route: '/client/compliance/library', icon: this.svg('M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4') },
          { label: 'Audits', route: '/client/audits', icon: this.svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4') },
        ],
      },
      {
        label: 'Payroll',
        expanded: false,
        items: [
          { label: 'Payroll', route: '/client/payroll', icon: this.svg('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z') },
          { label: 'Employees', route: '/client/employees', icon: this.svg('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z') },
          { label: 'Registers', route: '/client/registers', icon: this.svg('M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z') },
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
        label: 'Approvals',
        expanded: false,
        items: [
          { label: 'Nomination Approvals', route: '/client/approvals/nominations', icon: this.svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
          { label: 'Leave Approvals', route: '/client/approvals/leaves', icon: this.svg('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
        ],
      },
      {
        label: 'Support',
        expanded: false,
        items: [
          { label: 'My Queries', route: '/client/queries', icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
          { label: 'Help & Support', route: '/client/support', icon: this.svg('M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z') },
        ],
      },
      {
        label: 'Account',
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
}
