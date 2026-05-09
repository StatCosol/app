import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';

interface ClientOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Landing page for the top-level "Registrations & Licenses" sidebar entry.
 * Lets the CRM pick a client, then routes to the existing
 * /crm/clients/:clientId/registrations workspace.
 */
@Component({
  selector: 'app-crm-registrations-landing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Registrations &amp; Licenses</h1>
          <p>Select a client to manage their branch registrations, licenses and renewal documents.</p>
        </div>
      </header>

      <div *ngIf="loading" class="muted">Loading clients…</div>

      <div *ngIf="!loading && !clients.length" class="empty">
        No clients are currently assigned to you.
      </div>

      <section *ngIf="!loading && clients.length" class="card">
        <label for="reg-client-picker">Client</label>
        <div class="row">
          <select
            id="reg-client-picker"
            name="selectedClientId"
            [(ngModel)]="selectedClientId"
          >
            <option value="">Select a client…</option>
            <option *ngFor="let c of clients" [value]="c.id">
              {{ c.name }}<span *ngIf="c.code"> ({{ c.code }})</span>
            </option>
          </select>
          <button
            type="button"
            class="btn"
            [disabled]="!selectedClientId"
            (click)="open()"
          >
            Open Registrations Workspace
          </button>
        </div>

        <div *ngIf="clients.length" class="quick">
          <span class="quick-label">Quick open:</span>
          <button
            type="button"
            class="chip"
            *ngFor="let c of clients.slice(0, 12)"
            (click)="goTo(c.id)"
            [title]="c.name"
          >
            {{ c.name }}
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .page { max-width: 960px; margin: 0 auto; }
    .head h1 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
    .head p { margin: 4px 0 14px; font-size: 12px; color: #64748b; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
    label { display: block; font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    select { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; font-size: 13px; background: #fff; min-width: 280px; flex: 1; }
    .btn { border: 1px solid #0f172a; border-radius: 10px; padding: 10px 14px; font-size: 13px; background: #0f172a; color: #fff; cursor: pointer; white-space: nowrap; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .quick { margin-top: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .quick-label { font-size: 12px; color: #64748b; font-weight: 600; }
    .chip { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 999px; padding: 5px 10px; font-size: 12px; color: #0f172a; cursor: pointer; }
    .chip:hover { background: #eef2ff; border-color: #c7d2fe; }
    .muted { color: #64748b; font-size: 13px; padding: 12px 0; }
    .empty { border: 1px dashed #d1d5db; border-radius: 10px; padding: 18px; color: #6b7280; text-align: center; }
  `],
})
export class CrmRegistrationsLandingComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  clients: ClientOption[] = [];
  selectedClientId = '';

  constructor(
    private readonly router: Router,
    private readonly crmClientsApi: CrmClientsApi,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.crmClientsApi
      .getAssignedClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.clients = (rows || []).map((c: any) => ({
            id: c.id || c.clientId,
            name: c.clientName || c.name || 'Client',
            code: c.clientCode || '',
          }));
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  open(): void {
    if (!this.selectedClientId) return;
    this.goTo(this.selectedClientId);
  }

  goTo(clientId: string): void {
    this.router.navigate(['/crm/clients', clientId, 'registrations']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
