import { Component, EventEmitter, Input, Output } from '@angular/core';

import { RouterModule } from '@angular/router';

interface NavItem {
  label: string;
  route: string;
  iconPath: string;
}

@Component({
  selector: 'app-sales-sidebar',
  standalone: true,
  imports: [RouterModule],
  template: `
    @if (mobileOpen) {
<div
         class="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
         (click)="closeMobile()"></div>
}

    <aside [class]="asideClasses">
      <div class="px-5 pt-5 pb-3 flex items-center gap-2">
        <div class="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
        </div>
        @if (!collapsed) {
<div>
          <div class="text-white font-bold tracking-tight">Sales</div>
          <div class="text-white/40 text-[11px]">Business Development</div>
        </div>
}
      </div>

      <button
        class="hidden lg:flex absolute top-5 -right-3 w-6 h-7 bg-white/10 border border-white/20 rounded-full items-center justify-center text-white hover:bg-white/20"
        (click)="toggleCollapsed()"
        [title]="collapsed ? 'Expand' : 'Collapse'"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path [attr.d]="collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        @for (item of items; track item) {
<a
           [routerLink]="item.route"
           routerLinkActive="bg-white/15 text-white"
           [routerLinkActiveOptions]="{ exact: item.route.endsWith('dashboard') }"
           (click)="onNavClick()"
           [title]="item.label"
           class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/75 hover:bg-white/10 hover:text-white transition-colors">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">
            <path [attr.d]="item.iconPath" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          @if (!collapsed) {
<span class="text-sm font-medium">{{ item.label }}</span>
}
        </a>
}
      </nav>

      @if (!collapsed) {
<div class="px-4 py-3 border-t border-white/10 text-center">
        <div class="text-[10px] text-white/40">Sales v1.0</div>
        <div class="text-[10px] text-white/55">StatCo Solutions</div>
      </div>
}
    </aside>
  `,
  styles: [`
    :host { display: contents; }
    aside {
      position: fixed; top: 0; left: 0; z-index: 50;
      height: 100vh; width: 16rem;
      transform: translateX(-100%);
      flex-shrink: 0;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #064E3B 0%, #047857 100%);
      box-shadow: 2px 0 16px rgba(6,78,59,0.18);
      transition: width .25s ease, transform .25s ease;
    }
    aside.mobile-open { transform: translateX(0); }
    @media (min-width: 1024px) {
      aside { position: sticky; transform: none; width: 15rem; }
      aside.is-collapsed { width: 4.25rem; }
    }
  `],
})
export class SalesSidebarComponent {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();
  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  items: NavItem[] = [
    { label: 'Dashboard', route: '/sales/dashboard', iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { label: 'Leads',     route: '/sales/leads',     iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'New Lead',  route: '/sales/leads/new', iconPath: 'M12 4v16m8-8H4' },
    { label: 'Follow-ups',route: '/sales/followups', iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Profile',   route: '/sales/profile',   iconPath: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  get asideClasses(): string {
    return [
      this.collapsed ? 'is-collapsed' : '',
      this.mobileOpen ? 'mobile-open' : '',
    ].filter(Boolean).join(' ');
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }

  closeMobile(): void {
    this.mobileOpen = false;
    this.mobileOpenChange.emit(false);
  }

  onNavClick(): void {
    setTimeout(() => {
      if (this.mobileOpen) this.closeMobile();
    });
  }
}
