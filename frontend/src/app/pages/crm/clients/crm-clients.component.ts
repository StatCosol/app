import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/ui';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { catchError, finalize, of, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ClientDto } from '../../../core/api/cco-clients.api';

@Component({
  selector: 'app-crm-clients',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="My Clients" description="Manage your assigned clients" icon="office-building"></ui-page-header>

      <div class="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          [(ngModel)]="search"
          (ngModelChange)="applyFilters()"
          placeholder="Search by name or code"
          class="rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"
        />

        <select [(ngModel)]="status" (ngModelChange)="applyFilters()"
                class="rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
          <option value="all">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div *ngIf="err" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{{ err }}</div>
      <div *ngIf="isLoading" class="text-gray-500 text-sm">Loading clients...</div>

      <div *ngIf="!isLoading && filtered.length > 0" class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Code</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branches</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr *ngFor="let c of filtered" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-mono text-gray-600">{{ c.clientCode }}</td>
              <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ c.clientName }}</td>
              <td class="px-4 py-3 text-sm">
                <span class="px-2 py-0.5 text-xs font-medium rounded-full"
                      [ngClass]="c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                  {{ c.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm">
                <a [routerLink]="['/crm/clients', c.id, 'branches']"
                   class="text-indigo-600 hover:text-indigo-800 font-medium">
                  View branches
                </a>
              </td>
              <td class="px-4 py-3 text-sm">
                <a [routerLink]="['/crm/clients', c.id, 'overview']"
                   class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg
                          text-xs font-medium hover:bg-indigo-100 transition-colors">
                  Open Workspace →
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p *ngIf="!isLoading && filtered.length === 0" class="text-gray-500 text-sm">No clients found.</p>
    </main>
  `,
})
export class CrmClientsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  all: ClientDto[] = [];
  filtered: ClientDto[] = [];
  isLoading = true;
  err: string | null = null;

  search = '';
  status: 'all' | 'ACTIVE' | 'INACTIVE' = 'all';

  constructor(private crmClientsApi: CrmClientsApi, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading = true;
    this.err = null;

    this.crmClientsApi.getAssignedClients()
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          this.err = err?.error?.message || 'Failed to load clients';
          return of([]);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((clients: any) => {
        this.isLoading = false;
        this.all = clients || [];
        this.applyFilters();
      });
  }

  applyFilters(): void {
    const term = this.search.trim().toLowerCase();
    this.filtered = this.all.filter((c) => {
      const matchesSearch = !term
        || c.clientName.toLowerCase().includes(term)
        || c.clientCode.toLowerCase().includes(term);
      const matchesStatus =
        this.status === 'all' ? true : c.status === this.status;
      return matchesSearch && matchesStatus;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
