import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { Component, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';

import { ThreadLayoutComponent } from '../../shared/thread';
import { PaydekThreadApiService } from '../../core/paydek-thread-api.service';
import { PageHeaderComponent } from '../../shared/ui';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';

@Component({
  selector: 'app-payroll-queries',
  standalone: true,
  providers: [PaydekThreadApiService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThreadLayoutComponent, PageHeaderComponent, ClientContextStripComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Queries & Tickets"
        subtitle="Manage payroll queries, clarifications, and support tickets"
      >
        <ui-client-context-strip [inline]="true" paramKey="clientId"></ui-client-context-strip>
      </ui-page-header>
      @for (contextId of contextIds; track contextId) {
        <app-thread-layout
          [api]="api"
          title="Tickets"
          [canClose]="true"
          [canResolve]="false"
          [canReopen]="true"
        >
        </app-thread-layout>
      }
    </div>
  `,
})
export class PayrollQueriesComponent implements OnInit, OnDestroy {
  contextIds: string[] = [];
  private destroy$ = new Subject<void>();
  constructor(
    public api: PaydekThreadApiService,
    private route: ActivatedRoute,
  ) {}
  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.api.clientId =
        params.get('clientId') || this.route.parent?.snapshot.paramMap.get('clientId') || '';
      this.contextIds = [this.api.clientId];
    });
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
