import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-payroll-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <aside class="w-60 bg-rose-800 text-white flex flex-col">
        <div class="p-5 text-xl font-bold tracking-wide border-b border-rose-600">StatCo Payroll</div>
        <nav class="flex-1 p-3 space-y-1">
          <a routerLink="dashboard" routerLinkActive="bg-rose-600" class="block px-3 py-2 rounded hover:bg-rose-600">Dashboard</a>
          <a routerLink="runs" routerLinkActive="bg-rose-600" class="block px-3 py-2 rounded hover:bg-rose-600">Payroll Runs</a>
          <a routerLink="payslips" routerLinkActive="bg-rose-600" class="block px-3 py-2 rounded hover:bg-rose-600">Payslips</a>
        </nav>
      </aside>
      <main class="flex-1 bg-gray-50 p-6 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class PayrollShellComponent {}
