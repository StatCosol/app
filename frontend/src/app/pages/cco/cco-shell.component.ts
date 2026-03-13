import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-cco-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <aside class="w-60 bg-purple-900 text-white flex flex-col">
        <div class="p-5 text-xl font-bold tracking-wide border-b border-purple-700">StatCo CCO</div>
        <nav class="flex-1 p-3 space-y-1">
          <a routerLink="dashboard" routerLinkActive="bg-purple-700" class="block px-3 py-2 rounded hover:bg-purple-700">Dashboard</a>
          <a routerLink="compliance" routerLinkActive="bg-purple-700" class="block px-3 py-2 rounded hover:bg-purple-700">Compliance</a>
        </nav>
      </aside>
      <main class="flex-1 bg-gray-50 p-6 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class CcoShellComponent {}
