import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-auditor-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'AUDITOR'" [displayName]="'Auditor User'"></app-role-header>
    <div class="auditor-content">
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: ['./auditor-layout.component.scss']
})
export class AuditorLayoutComponent {}
