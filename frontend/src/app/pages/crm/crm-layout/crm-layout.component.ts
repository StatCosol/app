import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-crm-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'CRM'" [displayName]="'CRM User'"></app-role-header>
    <router-outlet></router-outlet>
  `,
})
export class CrmLayoutComponent {}
