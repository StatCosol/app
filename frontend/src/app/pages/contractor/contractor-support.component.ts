import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { CreateQueryComponent } from '../../shared/notifications/create-query/create-query.component';
import { InboxComponent } from '../../shared/notifications/inbox/inbox.component';

@Component({
  selector: 'app-contractor-support',
  standalone: true,
  imports: [CommonModule, CreateQueryComponent, InboxComponent],
  template: `

    <main class="content">
      <div class="page contractor-support-page">
        <div class="card">
          <h2>Support · Create Query</h2>
          <p class="subtitle">
            Use this form to raise a query with the StatCo team.
          </p>

          <app-create-query [clientId]="clientId"></app-create-query>
        </div>

        <div class="card mt-lg">
          <h2>My Queries</h2>
          <app-notification-inbox [creatorView]="true"></app-notification-inbox>
        </div>
      </div>
    </main>
  `,
  styleUrls: ['./contractor-support.component.scss'],
})
export class ContractorSupportComponent implements OnInit {
  clientId?: string;

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    const user = this.auth.getUser();
    this.clientId = user?.clientId ? String(user.clientId) : undefined;
  }
}
