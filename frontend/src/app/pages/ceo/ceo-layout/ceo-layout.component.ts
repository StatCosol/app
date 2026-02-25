import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-ceo-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'CEO'" [displayName]="'CEO User'"></app-role-header>
    <main class="role-content ceo-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styleUrls: ['./ceo-layout.component.scss']
})
export class CeoLayoutComponent {}
