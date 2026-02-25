import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { PageHeaderComponent, StatusBadgeComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-client-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent, StatusBadgeComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div class="flex items-start justify-between gap-3">
        <ui-page-header title="Branches" description="Manage your company branches, documents, and compliance" icon="office-building"></ui-page-header>
        <button *ngIf="auth.isMasterUser()" (click)="openCreate()" class="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-statco-blue text-white text-sm font-semibold hover:opacity-90">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Add Branch
        </button>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          [(ngModel)]="search"
          placeholder="Search branches…"
          (input)="applyFilters()"
          class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-statco-blue/30 w-56"
        />
        <select [(ngModel)]="stateFilter" (change)="applyFilters()" class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All States</option>
          <option *ngFor="let s of states" [value]="s">{{ s }}</option>
        </select>
        <select [(ngModel)]="typeFilter" (change)="applyFilters()" class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All Establishment Types</option>
          <option value="HO">HO</option>
          <option value="BRANCH">Branch</option>
          <option value="FACTORY">Factory</option>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="SHOP">Shop</option>
        </select>
        <select [(ngModel)]="statusFilter" (change)="applyFilters()" class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <span class="ml-auto text-xs text-gray-400">{{ filtered.length }} branch{{ filtered.length !== 1 ? 'es' : '' }}</span>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex items-center justify-center py-20">
        <ui-loading-spinner></ui-loading-spinner>
      </div>

      <!-- Table -->
      <div *ngIf="!loading && filtered.length" class="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3 text-left">Branch Name</th>
              <th class="px-4 py-3 text-left">State</th>
              <th class="px-4 py-3 text-left">Type</th>
              <th class="px-4 py-3 text-center">Contractors</th>
              <th class="px-4 py-3 text-center">Compliances</th>
              <th class="px-4 py-3 text-center">Docs</th>
              <th class="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let b of filtered"
              (click)="viewBranch(b)"
              class="border-t border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
            >
              <td class="px-4 py-3 font-medium text-gray-900">
                {{ b.branchName }}
                <span *ngIf="b.establishmentType" class="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide"
                  [ngClass]="{
                    'bg-purple-50 text-purple-700': b.establishmentType === 'HO',
                    'bg-blue-50 text-blue-700': b.establishmentType === 'BRANCH',
                    'bg-amber-50 text-amber-700': b.establishmentType === 'FACTORY',
                    'bg-green-50 text-green-700': b.establishmentType === 'WAREHOUSE',
                    'bg-teal-50 text-teal-700': b.establishmentType === 'SHOP'
                  }">
                  {{ b.establishmentType }}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-600">{{ b.stateCode || '—' }}</td>
              <td class="px-4 py-3 text-gray-600">{{ b.branchType || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold"
                  [ngClass]="b.contractorCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'">
                  {{ b.contractorCount ?? 0 }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                  {{ b.complianceCount ?? 0 }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="text-xs text-gray-500">{{ b.approvedDocCount ?? 0 }}/{{ b.documentCount ?? 0 }}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <ui-status-badge [status]="b.status || 'ACTIVE'"></ui-status-badge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && filtered.length === 0" class="text-center py-16">
        <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
        <p class="text-gray-500">{{ branches.length ? 'No branches match your filters' : 'No branches found for your company' }}</p>
      </div>
    </div>

      <!-- Create Branch Modal -->
      <div *ngIf="showCreate" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div class="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div class="text-base font-semibold text-gray-900">Create Branch</div>
              <div class="text-xs text-gray-500">Branch user will be created if name + email are provided.</div>
            </div>
            <button (click)="closeCreate()" class="p-2 rounded-lg hover:bg-gray-100">
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-gray-600">Branch Name</label>
              <input [(ngModel)]="create.branchName" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Eg: Hyderabad Branch" />
            </div>
            <div>
              <label class="text-xs text-gray-600">State</label>
              <input [(ngModel)]="create.stateCode" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Eg: TS" />
            </div>
            <div>
              <label class="text-xs text-gray-600">Establishment Type</label>
              <select [(ngModel)]="create.establishmentType" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option value="BRANCH">Branch</option>
                <option value="HO">HO</option>
                <option value="FACTORY">Factory</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="SHOP">Shop</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-600">Branch Type</label>
              <input [(ngModel)]="create.branchType" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="HO/Unit/Project…" />
            </div>
            <div class="md:col-span-2">
              <label class="text-xs text-gray-600">Address</label>
              <input [(ngModel)]="create.address" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Full address" />
            </div>

            <div class="md:col-span-2 pt-2 border-t border-gray-100">
              <div class="text-sm font-semibold text-gray-900 mb-2">Branch User Login (optional)</div>
            </div>
            <div>
              <label class="text-xs text-gray-600">User Name</label>
              <input [(ngModel)]="create.branchUserName" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Eg: Branch Operator" />
            </div>
            <div>
              <label class="text-xs text-gray-600">User Email</label>
              <input [(ngModel)]="create.branchUserEmail" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="branch@company.com" />
            </div>
            <div>
              <label class="text-xs text-gray-600">Password (optional)</label>
              <input [(ngModel)]="create.branchUserPassword" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Leave blank to auto-generate" />
            </div>

            <div *ngIf="createdCreds" class="md:col-span-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <div class="text-xs text-blue-800 font-semibold mb-1">Branch user created</div>
              <div class="text-xs text-blue-800">Email: <span class="font-mono">{{ createdCreds.email }}</span></div>
              <div class="text-xs text-blue-800">Password: <span class="font-mono">{{ createdCreds.password }}</span></div>
            </div>
          </div>

          <div class="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
            <div *ngIf="createError" class="text-sm text-red-600 mr-auto">{{ createError }}</div>
            <button (click)="closeCreate()" class="px-4 py-2 rounded-lg border border-gray-200 text-sm">Cancel</button>
            <button [disabled]="saving || !create.branchName" (click)="submitCreate()" class="px-4 py-2 rounded-lg bg-statco-blue text-white text-sm font-semibold disabled:opacity-50">
              {{ saving ? 'Saving…' : 'Create' }}
            </button>
          </div>
        </div>
      </div>

  `,
})
export class ClientBranchesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  branches: any[] = [];
  filtered: any[] = [];
  loading = true;
  showCreate = false;
  saving = false;
  createError: string | null = null;
  createdCreds: { email: string; password: string } | null = null;
  create = this.newCreateModel();

  search = '';
  stateFilter = '';
  typeFilter = '';
  statusFilter = '';
  states: string[] = [];

  constructor(
    private svc: ClientBranchesService,
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.svc.list().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.branches = res || [];
        this.states = [...new Set(this.branches.map((b) => b.stateCode).filter(Boolean))].sort();
        this.applyFilters();
      },
      error: () => { this.loading = false; this.branches = []; this.filtered = []; },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilters(): void {
    let list = [...this.branches];
    const q = this.search.toLowerCase().trim();
    if (q) list = list.filter((b) => b.branchName?.toLowerCase().includes(q) || b.address?.toLowerCase().includes(q));
    if (this.stateFilter) list = list.filter((b) => b.stateCode === this.stateFilter);
    if (this.typeFilter) list = list.filter((b) => b.establishmentType === this.typeFilter);
    if (this.statusFilter) list = list.filter((b) => b.status?.toUpperCase() === this.statusFilter);
    this.filtered = list;
    this.cdr.detectChanges();
  }

  viewBranch(b: any): void {
    this.router.navigate(['/client/branches', b.id]);
  }

  openCreate(): void {
    this.create = this.newCreateModel();
    this.createdCreds = null;
    this.showCreate = true;
    this.cdr.detectChanges();
  }

  closeCreate(): void {
    this.showCreate = false;
    this.saving = false;
    this.createdCreds = null;
    this.create = this.newCreateModel();
    this.cdr.detectChanges();
  }

  submitCreate(): void {
    if (this.saving || !this.create.branchName?.trim()) return;

    this.saving = true;
    this.createdCreds = null;
    this.createError = null;

    this.svc
      .create(this.create)
      .pipe(takeUntil(this.destroy$), finalize(() => {
        this.saving = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (res) => {
          if (!res) return;

          this.branches = [res, ...this.branches];
          this.states = [...new Set(this.branches.map((b) => b.stateCode).filter(Boolean))].sort();
          this.applyFilters();

          if (res.branchUser) {
            this.createdCreds = {
              email: res.branchUser.email,
              password: res.branchUser.password,
            };
          } else {
            this.closeCreate();
          }
        },
        error: (err) => {
          this.createError = err?.error?.message || 'Failed to create branch. Please try again.';
        },
      });
  }

  private newCreateModel() {
    return {
      branchName: '',
      stateCode: '',
      establishmentType: 'BRANCH',
      branchType: '',
      address: '',
      branchUserName: '',
      branchUserEmail: '',
      branchUserPassword: '',
    } as any;
  }
}
