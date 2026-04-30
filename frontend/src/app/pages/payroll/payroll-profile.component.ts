import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-payroll-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, PageHeaderComponent],
  template: `
    <div class="page">
      <ui-page-header
        title="Profile"
        description="Your account information"
        icon="user">
      </ui-page-header>
      
      <div class="card" *ngIf="user">
        <div class="row"><span class="k">Name</span><span class="v">{{ user.name || user.fullName }}</span></div>
        <div class="row"><span class="k">Email</span><span class="v">{{ user.email }}</span></div>
        <div class="row"><span class="k">Role</span><span class="v">{{ user.roleCode }}</span></div>
      </div>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-top: 1rem; }
      .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
      .row:last-child { border-bottom: none; }
      .k { color: #6b7280; font-size: 13px; }
      .v { font-weight: 600; }
    `,
  ],
})
export class PayrollProfileComponent {
  user: any = null;

  constructor(private auth: AuthService) {
    this.user = this.auth.getUser();
  }
}
