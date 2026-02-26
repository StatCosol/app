import { Component, Input, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuService } from '../../core/menu/menu.service';
import { MenuItem, RoleCode } from '../../core/menu/menu.model';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-role-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Top Brand Bar -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        <div class="flex items-center justify-between py-3 sm:py-5 gap-3 sm:gap-4 flex-wrap">
          <!-- Logo -->
          <div class="flex items-center min-w-0">
            <!-- Overlapping Circles Logo -->
            <div class="relative flex-shrink-0" style="width: 56px; height: 40px;">
              <div class="absolute rounded-full" style="width: 36px; height: 36px; background-color: #1eb6f7; left: 0; top: 2px;"></div>
              <div class="absolute rounded-full" style="width: 36px; height: 36px; background-color: #0a2656; left: 20px; top: 2px;"></div>
            </div>
            <!-- Divider -->
            <div class="w-1 h-8" style="background-color: #0a2656;"></div>
            <!-- Company Name -->
            <h1 class="text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight ml-3 truncate"
                style="color:#0a2656; font-family:'Times New Roman', Georgia, serif; max-width:65vw;">
              StatCo Solutions
            </h1>
          </div>

          <!-- Contact Info -->
          <div class="hidden lg:flex items-center gap-4 xl:gap-6 text-sm text-gray-600 flex-shrink-0">
            <a href="mailto:compliance@statcosol.com" class="flex items-center gap-2 hover:text-statco-blue transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
              <span>compliance@statcosol.com</span>
            </a>
            <a href="tel:+919000607839" class="flex items-center gap-2 hover:text-statco-blue transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
              </svg>
              <span>+91 9000607839</span>
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation Bar -->
    <header class="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div class="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        <div class="flex items-center justify-between" style="min-height: 56px;">

          <!-- Mobile hamburger -->
          <button
            class="md:hidden p-2 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            (click)="mobileMenuOpen = !mobileMenuOpen"
            [attr.aria-expanded]="mobileMenuOpen"
            aria-label="Toggle navigation menu">
            <svg *ngIf="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            <svg *ngIf="mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>

          <!-- Desktop Navigation (hidden on mobile) -->
          <nav class="hidden md:flex items-center gap-0.5 lg:gap-1 flex-1 overflow-x-auto" *ngIf="menus.length">
            <a *ngFor="let m of menus"
               [routerLink]="m.route"
               routerLinkActive="nav-active"
               [routerLinkActiveOptions]="{ exact: m.route.endsWith('dashboard') }"
               class="nav-item">
              {{ m.label }}
            </a>
          </nav>

          <!-- User Info & Logout -->
          <div class="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div class="text-right hidden sm:block">
              <div class="text-sm font-semibold text-gray-900">{{ displayName }}</div>
              <div class="text-xs text-gray-500">{{ roleLabel }}</div>
            </div>
            <button
              (click)="logout()"
              class="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-statco-blue rounded-lg hover:bg-statco-blue/90 transition-colors focus:outline-none focus:ring-2 focus:ring-statco-blue focus:ring-offset-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
              </svg>
              <span class="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile Navigation Dropdown -->
      <div class="md:hidden border-t border-gray-100 bg-white shadow-inner" *ngIf="mobileMenuOpen && menus.length">
        <div class="max-w-7xl mx-auto px-3 py-2">
          <nav class="flex flex-col gap-0.5">
            <a *ngFor="let m of menus"
               [routerLink]="m.route"
               routerLinkActive="nav-active"
               [routerLinkActiveOptions]="{ exact: m.route.endsWith('dashboard') }"
               class="mobile-nav-item"
               (click)="mobileMenuOpen = false">
              {{ m.label }}
            </a>
          </nav>
        </div>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; width: 100%; }

    .nav-item {
      @apply px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-all duration-150 whitespace-nowrap;
    }

    .nav-item.nav-active {
      @apply bg-statco-blue/10 text-statco-blue;
    }

    .mobile-nav-item {
      @apply block px-3 py-2.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-all duration-150;
    }

    .mobile-nav-item.nav-active {
      @apply bg-statco-blue/10 text-statco-blue font-semibold;
    }

    @media (max-width: 420px) {
      .nav-item {
        padding-left: 0.5rem;
        padding-right: 0.5rem;
      }
    }
  `]
})
export class RoleHeaderComponent implements OnInit {
  @Input() role!: RoleCode;
  @Input() displayName = 'User';

  menus: MenuItem[] = [];
  mobileMenuOpen = false;

  private roleLabels: Record<RoleCode, string> = {
    ADMIN: 'Administrator',
    CEO: 'CEO Command',
    CCO: 'CCO Console',
    CRM: 'CRM Portal',
    AUDITOR: 'AuditXpert',
    CLIENT: 'LegitX',
    CONTRACTOR: 'ConTrack',
    PAYROLL: 'PayDek',
    EMPLOYEE: 'Employee',
    PF_TEAM: 'PF Team',
  };

  constructor(
    private menuService: MenuService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.menus = this.menuService.getMenusForRole(this.role);
    const name = this.auth.getUser()?.name;
    if (name) this.displayName = name;
  }

  get roleLabel(): string {
    return this.roleLabels[this.role] || this.role;
  }

  logout(): void {
    this.auth.logout('User clicked logout');
  }
}
