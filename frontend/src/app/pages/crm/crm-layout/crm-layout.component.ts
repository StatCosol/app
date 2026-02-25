import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-crm-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'CRM'" [displayName]="'CRM User'"></app-role-header>
    <main class="role-content crm-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    :host { display: block; width: 100%; min-height: 100vh; background: #f9fafb; }
    .crm-content { padding-top: 1.25rem; }
  `],
})
export class CrmLayoutComponent {}
