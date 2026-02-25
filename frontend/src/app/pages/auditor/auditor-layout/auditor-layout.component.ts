import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoleHeaderComponent } from '../../../shared/role-header/role-header.component';

@Component({
  selector: 'app-auditor-layout',
  standalone: true,
  imports: [RouterOutlet, RoleHeaderComponent],
  template: `
    <app-role-header [role]="'AUDITOR'" [displayName]="'Auditor User'"></app-role-header>
    <main class="role-content auditor-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styleUrls: ['./auditor-layout.component.scss']
})
export class AuditorLayoutComponent {}
