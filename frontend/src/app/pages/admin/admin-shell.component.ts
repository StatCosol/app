import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <aside class="w-60 bg-gray-900 text-white flex flex-col">
        <div class="p-5 text-xl font-bold tracking-wide border-b border-gray-700">StatCo Admin</div>
        <nav class="flex-1 p-3 space-y-1">
          <a routerLink="dashboard" routerLinkActive="bg-gray-700" class="block px-3 py-2 rounded hover:bg-gray-700">Dashboard</a>
          <a routerLink="users" routerLinkActive="bg-gray-700" class="block px-3 py-2 rounded hover:bg-gray-700">Users</a>
          <a routerLink="settings" routerLinkActive="bg-gray-700" class="block px-3 py-2 rounded hover:bg-gray-700">Settings</a>
        </nav>
      </aside>
      <main class="flex-1 bg-gray-50 p-6 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AdminShellComponent {}
