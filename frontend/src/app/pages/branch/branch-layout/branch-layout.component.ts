import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  template: `
    <div class="min-h-screen bg-slate-50">
      <header class="bg-white border-b border-slate-200 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-800">BranchDesk</p>
            <p class="text-xs text-slate-500">Branch-only workspace for uploads</p>
          </div>
          <nav class="flex gap-2 text-sm">
            <a routerLink="/branch/dashboard" routerLinkActive="active" class="nav-pill">Dashboard</a>
            <a routerLink="/branch/mcd" routerLinkActive="active" class="nav-pill">MCD Uploads</a>
            <a routerLink="/branch/returns" routerLinkActive="active" class="nav-pill">Returns</a>
          </nav>
        </div>
      </header>
      <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
    .nav-pill { @apply px-3 py-1.5 rounded-full text-slate-700 hover:bg-slate-100; }
    .active { @apply bg-blue-50 text-blue-700; }
    `,
  ],
})
export class BranchLayoutComponent {}
