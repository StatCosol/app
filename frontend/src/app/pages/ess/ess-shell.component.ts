import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-ess-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <aside class="w-60 bg-cyan-800 text-white flex flex-col">
        <div class="p-5 text-xl font-bold tracking-wide border-b border-cyan-600">StatCo ESS</div>
        <nav class="flex-1 p-3 space-y-1">
          <a routerLink="dashboard" routerLinkActive="bg-cyan-600" class="block px-3 py-2 rounded hover:bg-cyan-600">Dashboard</a>
          <a routerLink="payslips" routerLinkActive="bg-cyan-600" class="block px-3 py-2 rounded hover:bg-cyan-600">My Payslips</a>
          <a routerLink="leave" routerLinkActive="bg-cyan-600" class="block px-3 py-2 rounded hover:bg-cyan-600">Leave</a>
        </nav>
      </aside>
      <main class="flex-1 bg-gray-50 p-6 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class EssShellComponent {}
