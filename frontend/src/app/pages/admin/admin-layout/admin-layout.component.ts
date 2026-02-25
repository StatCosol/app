import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'ADMIN'" [displayName]="'StatCo Admin'"></app-role-header>
    <main class="role-content admin-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styleUrls: ['./admin-layout.component.scss']
})
export class AdminLayoutComponent {}
