import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-cco-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'CCO'" [displayName]="'CCO User'"></app-role-header>
    <main class="role-content cco-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styleUrls: ['./cco-layout.component.scss']
})
export class CcoLayoutComponent {}
