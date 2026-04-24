import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { ClientContextService } from '../../../core/client-context.service';

export interface ContextBadge {
  label: string;
  value: string;
}

@Component({
  selector: 'ui-client-context-strip',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngIf="clientName" class="client-context-strip" [class.strip-inline]="inline">
      <div class="strip-left">
        <a *ngIf="backRoute" [routerLink]="backRoute" class="strip-back" title="Back">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <span class="strip-avatar">{{ clientName.charAt(0) }}</span>
        <div class="strip-info">
          <span class="strip-name">{{ clientName }}</span>
          <span *ngIf="clientCode" class="strip-code">{{ clientCode }}</span>
        </div>
      </div>
      <div *ngIf="badges.length" class="strip-badges">
        <span *ngFor="let b of badges" class="strip-badge">
          <span class="badge-label">{{ b.label }}:</span> {{ b.value }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .client-context-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
      border: 1px solid #c7d2fe;
      border-radius: 10px;
      padding: 0.5rem 0.75rem;
      margin-bottom: 1rem;
    }
    .client-context-strip.strip-inline {
      margin-bottom: 0;
    }
    .strip-back {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 6px;
      color: #4338ca;
      transition: background 0.15s;
    }
    .strip-back:hover {
      background: #c7d2fe;
    }
    .strip-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-width: 0;
    }
    .strip-avatar {
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: #4f46e5;
      color: #fff;
      font-size: 0.8rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .strip-info {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      min-width: 0;
      flex-wrap: wrap;
    }
    .strip-name {
      font-size: 0.82rem;
      font-weight: 700;
      color: #1e1b4b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .strip-code {
      font-size: 0.72rem;
      font-weight: 600;
      color: #4338ca;
      background: #fff;
      border: 1px solid #c7d2fe;
      border-radius: 4px;
      padding: 0.05rem 0.35rem;
      white-space: nowrap;
    }
    .strip-badges {
      display: flex;
      gap: 0.4rem;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .strip-badge {
      font-size: 0.72rem;
      color: #374151;
      background: #fff;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 0.1rem 0.4rem;
      white-space: nowrap;
    }
    .badge-label {
      color: #6b7280;
    }
    @media (max-width: 640px) {
      .client-context-strip {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `],
})
export class ClientContextStripComponent implements OnInit, OnDestroy {
  /** If set, skip auto-resolution and use these values directly. */
  @Input() clientName = '';
  @Input() clientCode = '';
  /** Route param name to read clientId from. Default: 'clientId'. */
  @Input() paramKey = 'clientId';
  /** Extra badges to display on the right (e.g. branch, audit code, payroll month). */
  @Input() badges: ContextBadge[] = [];
  /** Optional back-navigation route. When set, a back arrow appears on the left. */
  @Input() backRoute: string | any[] = '';
  /** When true, removes bottom margin for inline use inside another component's row. */
  @Input() inline = false;

  private destroy$ = new Subject<void>();
  private manuallySet = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ctx: ClientContextService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Auto-detect back route from URL if not explicitly provided
    if (!this.backRoute) {
      const url = this.router.url;
      // Match /crm/clients/:id/sub-page or /payroll/clients/:id/sub-page
      const sub = url.match(/^\/(crm|payroll)\/clients\/([^/]+)\/(.+)/);
      if (sub) {
        // On a sub-page → go back to the client overview
        this.backRoute = `/${sub[1]}/clients/${sub[2]}/overview`;
      } else {
        // On the overview itself → go back to the client list
        const m = url.match(/^\/(crm|payroll)\/clients\/[^/]+/);
        if (m) {
          this.backRoute = `/${m[1]}/clients`;
        }
      }
    }

    if (this.clientName) {
      this.manuallySet = true;
      return;
    }

    this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get(this.paramKey) ?? '';
        return this.ctx.resolve(id);
      }),
      takeUntil(this.destroy$),
    ).subscribe((client) => {
      if (client) {
        this.clientName = client.clientName;
        this.clientCode = client.clientCode;
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
