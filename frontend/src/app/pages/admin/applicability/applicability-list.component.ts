import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminClientsService, Client, Branch } from '../clients/admin-clients.service';

@Component({
  selector: 'app-applicability-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <h1 class="text-2xl font-bold text-slate-800 mb-1">Applicability Engine</h1>
      <p class="text-slate-500 mb-6">Configure compliance applicability rules per branch</p>

      @if (error) {
        <div class="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <svg class="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/></svg>
          <span class="text-sm">{{ error }}</span>
        </div>
      }

      @if (loading) {
        <div class="flex items-center gap-2 text-slate-500">
          <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Loading clients…
        </div>
      }

      @for (client of clients; track client.id) {
        <div class="mb-4 border border-slate-200 rounded-lg bg-white shadow-sm">
          <button (click)="toggle(client)" class="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition">
            <div class="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              <span class="font-semibold text-slate-700">{{ client.clientName }}</span>
              <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{{ client.branchesCount || 0 }} branches</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400 transition-transform" [class.rotate-180]="expanded[client.id]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>

          @if (expanded[client.id]) {
            <div class="border-t border-slate-100 px-5 py-3">
              @if (branchesLoading[client.id]) {
                <p class="text-sm text-slate-400 py-2">Loading branches…</p>
              } @else if (branches[client.id]?.length === 0) {
                <p class="text-sm text-slate-400 py-2">No branches configured</p>
              } @else {
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 border-b border-slate-100">
                      <th class="py-2 font-medium">Branch</th>
                      <th class="py-2 font-medium">Type</th>
                      <th class="py-2 font-medium">State</th>
                      <th class="py-2 font-medium">Employees</th>
                      <th class="py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (branch of branches[client.id]; track branch.id) {
                      <tr class="border-b border-slate-50 hover:bg-slate-50">
                        <td class="py-2.5 font-medium text-slate-700">{{ branch.branchName }}</td>
                        <td class="py-2.5 text-slate-500">{{ branch.branchType }}</td>
                        <td class="py-2.5 text-slate-500">{{ branch.stateCode || '—' }}</td>
                        <td class="py-2.5 text-slate-500">{{ branch.employeeCount || 0 }}</td>
                        <td class="py-2.5 text-right">
                          <a [routerLink]="['/admin/branches', branch.id, 'applicability']"
                             class="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm">
                            Configure
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                          </a>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          }
        </div>
      }

      @if (!loading && clients.length === 0) {
        <p class="text-slate-400 text-center py-12">No clients found</p>
      }
    </div>
  `,
})
export class ApplicabilityListComponent implements OnInit {
  private readonly svc = inject(AdminClientsService);
  private readonly cdr = inject(ChangeDetectorRef);

  clients: Client[] = [];
  loading = true;
  error = '';
  expanded: Record<string, boolean> = {};
  branches: Record<string, Branch[]> = {};
  branchesLoading: Record<string, boolean> = {};

  ngOnInit(): void {
    this.svc.getClients().subscribe({
      next: (list) => {
        this.clients = list;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load clients';
        this.cdr.detectChanges();
      },
    });
  }

  toggle(client: Client): void {
    const id = client.id;
    this.expanded[id] = !this.expanded[id];
    this.cdr.detectChanges();
    if (this.expanded[id] && !this.branches[id]) {
      this.branchesLoading[id] = true;
      this.svc.getBranches(id).subscribe({
        next: (list) => {
          this.branches[id] = list;
          this.branchesLoading[id] = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.branchesLoading[id] = false;
          this.cdr.detectChanges();
        },
      });
    }
  }
}
