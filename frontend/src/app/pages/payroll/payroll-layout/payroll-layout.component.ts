import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-payroll-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'PAYROLL'" [displayName]="'StatCo Payroll'"></app-role-header>
    <main class="role-content payroll-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [
    `
      .payroll-content {
        padding-top: 1.25rem;
      }
    `,
  ],
})
export class PayrollLayoutComponent {}
