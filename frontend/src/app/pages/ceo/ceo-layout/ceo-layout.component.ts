import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-ceo-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'CEO'" [displayName]="'CEO User'"></app-role-header>
    <div class="ceo-content">
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: ['./ceo-layout.component.scss']
})
export class CeoLayoutComponent {}
