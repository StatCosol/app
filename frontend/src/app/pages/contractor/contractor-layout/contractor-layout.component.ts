import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';
import { ClientSidebarComponent } from '../../client/client-layout/client-sidebar.component';

@Component({
  selector: 'app-contractor-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RoleHeaderComponent, ClientSidebarComponent],
  template: `
    <div class="contractor-shell">
      <!-- Mobile menu toggle -->
      <button
        class="lg:hidden fixed bottom-6 right-6 z-50 p-3.5 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 ring-4 ring-white/80"
        style="background: linear-gradient(135deg, #0a2656, #051734);"
        (click)="mobileOpen = true"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <app-client-sidebar
        [(collapsed)]="sidebarCollapsed"
        [(mobileOpen)]="mobileOpen"
        [collapsedLinksInput]="collapsedLinks"
        [navGroupsInput]="navGroups"
      ></app-client-sidebar>

      <div class="flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300">
        <app-role-header [role]="'CONTRACTOR'" [displayName]="'Contractor User'"></app-role-header>

        <main class="role-content contractor-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styleUrls: ['./contractor-layout.component.scss']
})
export class ContractorLayoutComponent {
  sidebarCollapsed = false;
  mobileOpen = false;

  collapsedLinks: Array<{ label: string; route: string; icon: SafeHtml }> = [];
  navGroups: Array<{ label: string; expanded?: boolean; items: Array<{ label: string; route: string; icon: SafeHtml }> }> = [];

  constructor(private sanitizer: DomSanitizer) {
    this.buildNavData();
  }

  private buildNavData(): void {
    this.collapsedLinks = [
      { label: 'Dashboard', route: '/contractor/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
      { label: 'Compliance', route: '/contractor/compliance', icon: this.svg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
      { label: 'Tasks', route: '/contractor/tasks', icon: this.svg('M9 12h6m-6 4h6M9 8h6m-8 8h-.01M9 4h6M5 4h.01M5 12h.01M5 20h.01') },
      { label: 'Notifications', route: '/contractor/notifications', icon: this.svg('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
      { label: 'Support', route: '/contractor/support', icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
      { label: 'Profile', route: '/contractor/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
    ];

    this.navGroups = [
      {
        label: 'Overview',
        expanded: false,
        items: [
          { label: 'Dashboard', route: '/contractor/dashboard', icon: this.svg('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6') },
        ],
      },
      {
        label: 'Work',
        expanded: false,
        items: [
          { label: 'Compliance', route: '/contractor/compliance', icon: this.svg('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
          { label: 'Tasks', route: '/contractor/tasks', icon: this.svg('M9 12h6m-6 4h6M9 8h6m-8 8h-.01M9 4h6M5 4h.01M5 12h.01M5 20h.01') },
          { label: 'Notifications', route: '/contractor/notifications', icon: this.svg('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
        ],
      },
      {
        label: 'Support',
        expanded: false,
        items: [
          { label: 'Support', route: '/contractor/support', icon: this.svg('M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z') },
        ],
      },
      {
        label: 'Account',
        expanded: false,
        items: [
          { label: 'Profile', route: '/contractor/profile', icon: this.svg('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
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
