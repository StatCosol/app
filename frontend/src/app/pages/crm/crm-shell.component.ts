import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-crm-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <aside class="w-60 bg-teal-800 text-white flex flex-col">
        <div class="p-5 text-xl font-bold tracking-wide border-b border-teal-600">StatCo CRM</div>
        <nav class="flex-1 p-3 space-y-1">
          <a routerLink="dashboard" routerLinkActive="bg-teal-600" class="block px-3 py-2 rounded hover:bg-teal-600">Dashboard</a>
          <a routerLink="clients" routerLinkActive="bg-teal-600" class="block px-3 py-2 rounded hover:bg-teal-600">Clients</a>
          <a routerLink="leads" routerLinkActive="bg-teal-600" class="block px-3 py-2 rounded hover:bg-teal-600">Leads</a>
        </nav>
      </aside>
      <main class="flex-1 bg-gray-50 p-6 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class CrmShellComponent {}
