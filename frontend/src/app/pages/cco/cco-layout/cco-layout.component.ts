import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-cco-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'CCO'" [displayName]="'CCO User'"></app-role-header>
    <div class="cco-content">
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: ['./cco-layout.component.scss']
})
export class CcoLayoutComponent {}
