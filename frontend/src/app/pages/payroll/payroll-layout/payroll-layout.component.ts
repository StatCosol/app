import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-payroll-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'PAYROLL'" [displayName]="'StatCo Payroll'"></app-role-header>
    <div class="payroll-content">
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [
    `
      .payroll-content {
        padding: 16px;
      }
    `,
  ],
})
export class PayrollLayoutComponent {}
