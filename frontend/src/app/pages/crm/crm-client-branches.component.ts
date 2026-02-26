import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, timeout, finalize } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { CrmClientsApi, BranchDto, CreateBranchRequest, BranchContractorDto } from '../../core/api/crm-clients.api';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  selector: 'app-crm-client-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="Branches" description="Manage branch offices for this client" icon="office-building"></ui-page-header>

      <!-- Back to client workspace -->
      <a [routerLink]="['/crm/clients', clientId, 'overview']"
         class="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-4">
        ← Back to client workspace
      </a>

      <div *ngIf="err" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{{ err }}</div>
      <ui-loading-spinner *ngIf="isLoading" text="Loading branches..."></ui-loading-spinner>

      <!-- Add Branch Card -->
      <div class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h3 class="text-base font-semibold text-gray-900 mb-4">Add New Branch</h3>
        <form (ngSubmit)="onCreateBranch()" #branchForm="ngForm">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" name="branchName" [(ngModel)]="newBranch.branchName" required
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select name="branchType" [(ngModel)]="newBranch.branchType"
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option value="HO">HO</option>
                <option value="BRANCH">BRANCH</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select name="status" [(ngModel)]="newBranch.status"
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State *</label>
              <select name="stateCode" [(ngModel)]="newBranch.stateCode" required
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option *ngFor="let s of states" [value]="s.code">{{ s.label }} ({{ s.code }})</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Establishment Type *</label>
              <select name="establishmentType" [(ngModel)]="newBranch.establishmentType" required
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option *ngFor="let t of establishmentTypes" [value]="t.code">{{ t.label }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">&nbsp;</label>
              <div class="text-xs text-gray-400 pt-3">State rules will apply automatically</div>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="sm:col-span-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" name="address" [(ngModel)]="newBranch.address"
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Employees</label>
              <input type="number" name="employeeCount" [(ngModel)]="newBranch.employeeCount" min="0"
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contractors</label>
              <input type="number" name="contractorCount" [(ngModel)]="newBranch.contractorCount" min="0"
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
          </div>

          <!-- Branch User Login Section -->
          <div class="border-t border-gray-200 pt-4 mt-2 mb-4">
            <h4 class="text-sm font-semibold text-gray-800 mb-3">Branch User Login (auto-created)</h4>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">User Name *</label>
                <input type="text" name="branchUserName" [(ngModel)]="newBranch.branchUserName" required
                       class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                       placeholder="e.g., Branch Manager" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" name="branchUserEmail" [(ngModel)]="newBranch.branchUserEmail" required
                       class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                       placeholder="branch@example.com" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="text" name="branchUserPassword" [(ngModel)]="newBranch.branchUserPassword"
                       class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                       placeholder="Leave empty to auto-generate" />
              </div>
            </div>
          </div>

          <div>
            <button type="submit" [disabled]="branchForm.invalid || creatingBranch"
                    class="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium
                           hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {{ creatingBranch ? 'Creating…' : '+ Create Branch' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Branch User Credentials Banner -->
      <div *ngIf="createdBranchUser" class="bg-green-50 border border-green-300 rounded-lg p-4 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h4 class="text-sm font-semibold text-green-800 mb-1">Branch User Created Successfully</h4>
            <p class="text-sm text-green-700">
              <strong>Email:</strong> {{ createdBranchUser.email }}
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <strong>Password:</strong> {{ createdBranchUser.password }}
            </p>
            <p class="text-xs text-green-600 mt-1">Please save these credentials — the password will not be shown again.</p>
          </div>
          <button (click)="createdBranchUser = null" class="text-green-600 hover:text-green-800 text-lg font-bold ml-4">&times;</button>
        </div>
      </div>

      <!-- Branches Table -->
      <div *ngIf="!isLoading && branches.length > 0" class="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <!-- Month selector for compliance % -->
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
          <label class="text-xs font-medium text-gray-500 uppercase">Compliance Month:</label>
          <input type="month" [(ngModel)]="selectedMonth" (change)="loadCompliancePercent()"
                 class="rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2 py-1" />
        </div>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estb. Type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employees</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compliance %</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr *ngFor="let b of branches" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ b.branchName }}</td>
              <td class="px-4 py-3 text-sm">
                <span class="px-2 py-0.5 text-xs font-medium rounded-full"
                      [ngClass]="b.branchType === 'HO' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'">
                  {{ b.branchType }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ b.stateCode || '—' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ b.establishmentType || '—' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ b.address || '—' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ b.employeeCount }}</td>
              <td class="px-4 py-3 text-sm">
                <span class="px-2 py-0.5 text-xs font-medium rounded-full"
                      [ngClass]="b.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                  {{ b.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm">
                <span class="font-black" [style.color]="$any(b).completionPercent < 50 ? '#dc2626' : $any(b).completionPercent < 80 ? '#d97706' : '#16a34a'">{{ $any(b).completionPercent ?? 0 }}%</span>
                <div class="text-xs text-gray-400">{{ $any(b).uploaded ?? 0 }}/{{ $any(b).totalApplicable ?? 0 }}</div>
              </td>
              <td class="px-4 py-3 text-sm">
                <div class="flex gap-2">
                  <button (click)="startEditBranch(b)"
                          class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
                  <button (click)="confirmDeleteBranch(b)"
                          class="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                  <button (click)="showContractors(b)"
                          class="text-teal-600 hover:text-teal-800 text-xs font-medium">Contractors</button>
                  <button (click)="showCompliances(b)"
                          class="text-amber-600 hover:text-amber-800 text-xs font-medium">Compliances</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p *ngIf="!isLoading && branches.length === 0" class="text-gray-500 text-sm">No branches found for this client.</p>

      <!-- Edit Branch Panel -->
      <div *ngIf="editingBranch" class="bg-white rounded-lg border border-indigo-200 p-5 mb-6">
        <h3 class="text-base font-semibold text-gray-900 mb-4">Edit Branch — {{ editingBranch.branchName }}</h3>
        <form (ngSubmit)="onUpdateBranch()" #editForm="ngForm">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" name="editBranchName" [(ngModel)]="editingBranch.branchName" required
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select name="editBranchType" [(ngModel)]="editingBranch.branchType"
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option value="HO">HO</option>
                <option value="BRANCH">BRANCH</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select name="editStatus" [(ngModel)]="editingBranch.status"
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State *</label>
              <select name="editStateCode" [(ngModel)]="editingBranch.stateCode" required
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option *ngFor="let s of states" [value]="s.code">{{ s.label }} ({{ s.code }})</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Establishment Type *</label>
              <select name="editEstablishmentType" [(ngModel)]="editingBranch.establishmentType" required
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                <option *ngFor="let t of establishmentTypes" [value]="t.code">{{ t.label }}</option>
              </select>
            </div>
            <div></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" name="editAddress" [(ngModel)]="editingBranch.address"
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Employees</label>
              <input type="number" name="editEmployeeCount" [(ngModel)]="editingBranch.employeeCount" min="0"
                     class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
            </div>
            <div class="flex items-end gap-2">
              <button type="submit" [disabled]="editForm.invalid || updatingBranch"
                      class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                             hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {{ updatingBranch ? 'Saving…' : 'Save' }}
              </button>
              <button type="button" (click)="cancelEdit()"
                      class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>

      <!-- Contractors Panel -->
      <div *ngIf="contractorsBranch" class="bg-white rounded-lg border border-teal-200 p-5 mb-6">
        <h3 class="text-base font-semibold text-gray-900 mb-4">
          Contractors for — {{ contractorsBranch.branchName }}
        </h3>

        <div *ngIf="contractorsError" class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
          {{ contractorsError }}
        </div>

        <ui-loading-spinner *ngIf="contractorsLoading" text="Loading contractors..."></ui-loading-spinner>

        <div *ngIf="!contractorsLoading && contractors.length > 0" class="overflow-hidden rounded-lg border border-gray-200 mb-4">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr *ngFor="let c of contractors" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ c.name || '—' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ c.email || '—' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ c.mobile || '—' }}</td>
                <td class="px-4 py-3 text-sm">
                  <div class="flex gap-2">
                    <button (click)="removeContractor(c)"
                            class="text-red-600 hover:text-red-800 text-xs font-medium">Remove</button>
                    <button (click)="openEditContractorBranches(c)"
                            class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit Branches</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p *ngIf="!contractorsLoading && contractors.length === 0" class="text-gray-500 text-sm mb-4">
          No contractors linked to this branch.
        </p>

        <!-- Add Contractor -->
        <form (ngSubmit)="addContractor()" #contractorForm="ngForm" class="flex items-end gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contractor User ID</label>
            <input type="text" name="contractorUserId" [(ngModel)]="newContractorUserId" required
                   class="rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <button type="submit" [disabled]="contractorForm.invalid || addingContractor"
                  class="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                         hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {{ addingContractor ? 'Linking…' : 'Add Contractor' }}
          </button>
        </form>
      </div>

      <!-- Edit Contractor Branches Panel -->
      <div *ngIf="editContractorBranchesUserId" class="bg-white rounded-lg border border-indigo-200 p-5 mb-6">
        <h3 class="text-base font-semibold text-gray-900 mb-4">
          Edit Branches for {{ editContractorBranchesUserLabel || 'Contractor' }}
        </h3>

        <div *ngIf="editContractorBranchesError" class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
          {{ editContractorBranchesError }}
        </div>

        <ui-loading-spinner *ngIf="editContractorBranchesLoading" text="Loading contractor branches..."></ui-loading-spinner>

        <div *ngIf="!editContractorBranchesLoading">
          <p *ngIf="branches.length === 0" class="text-gray-500 text-sm">No branches available.</p>

          <div *ngIf="branches.length > 0" class="flex flex-wrap gap-3 mb-4">
            <label *ngFor="let b of branches"
                   class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 text-sm cursor-pointer
                          hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
              <input type="checkbox" name="contractorBranches" [value]="b.id" [(ngModel)]="editContractorBranchesSelected"
                     class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              {{ b.branchName }}
            </label>
          </div>

          <div class="flex gap-2">
            <button type="button" (click)="saveEditContractorBranches()" [disabled]="saveEditContractorBranchesLoading"
                    class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                           hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {{ saveEditContractorBranchesLoading ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" (click)="cancelEditContractorBranches()"
                    class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Compliances Panel -->
      <div *ngIf="compliancesBranch" class="bg-white rounded-lg border border-amber-200 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold text-gray-900">
            Compliances for — {{ compliancesBranch.branchName }}
          </h3>
          <button (click)="compliancesBranch = null"
                  class="text-gray-400 hover:text-gray-600 text-sm">Close</button>
        </div>

        <div *ngIf="compliancesError" class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
          {{ compliancesError }}
        </div>
        <div *ngIf="compliancesSuccess" class="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm mb-3">
          {{ compliancesSuccess }}
        </div>

        <ui-loading-spinner *ngIf="compliancesLoading" text="Loading compliances..."></ui-loading-spinner>

        <div *ngIf="!compliancesLoading && compliances.length > 0">
          <!-- Summary -->
          <p class="text-xs text-gray-500 mb-3">
            Showing all {{ compliances.length }} compliance items.
            <span class="font-medium text-indigo-600">{{ selected.size }}</span> selected for this branch.
          </p>

          <div class="overflow-hidden rounded-lg border border-gray-200 mb-4">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                    <input type="checkbox" [checked]="selected.size === compliances.length"
                           (change)="toggleAll($event)"
                           class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Law</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicable</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr *ngFor="let c of compliances" class="hover:bg-gray-50"
                    [ngClass]="{ 'bg-indigo-50/40': selected.has(c.complianceId) }">
                  <td class="px-3 py-3">
                    <input type="checkbox" [checked]="selected.has(c.complianceId)"
                           (change)="onToggle(c.complianceId, $any($event.target).checked)"
                           class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  </td>
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ c.complianceName }}</td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ c.lawName || '—' }}</td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ c.frequency || '—' }}</td>
                  <td class="px-4 py-3 text-sm">
                    <span *ngIf="c.applicable" class="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Yes</span>
                    <span *ngIf="!c.applicable" class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500"
                          [title]="c.reason || ''">No</span>
                  </td>
                  <td class="px-4 py-3 text-sm">
                    <span *ngIf="selected.has(c.complianceId)"
                          class="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">PENDING</span>
                    <span *ngIf="!selected.has(c.complianceId)"
                          class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-400">Not Assigned</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Save button -->
          <div class="flex items-center gap-3">
            <button (click)="saveCompliances()" [disabled]="savingCompliances"
                    class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium
                           hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {{ savingCompliances ? 'Saving…' : 'Save Compliance Selections' }}
            </button>
            <span class="text-xs text-gray-400">CRM can add/remove compliance mappings for this branch</span>
          </div>
        </div>

        <p *ngIf="!compliancesLoading && compliances.length === 0" class="text-gray-500 text-sm">
          No compliance master records found. Ask Admin to seed the compliance master list.
        </p>
      </div>
    </main>
  `,
})
export class CrmClientBranchesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  clientId!: string;
  branches: BranchDto[] = [];
  isLoading = true;
  err = '';

  selectedMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

   newBranch: CreateBranchRequest = {
     branchName: '',
     branchType: 'HO',
     address: '',
     employeeCount: 0,
     contractorCount: 0,
     status: 'ACTIVE',
     stateCode: 'TG',
     establishmentType: 'BRANCH',
     branchUserName: '',
     branchUserEmail: '',
     branchUserPassword: '',
   };

   creatingBranch = false;
   createdBranchUser: { email: string; password: string } | null = null;

  editingBranch: BranchDto | null = null;
  updatingBranch = false;

  contractorsBranch: BranchDto | null = null;
  contractors: BranchContractorDto[] = [];
  contractorsLoading = false;
  contractorsError = '';
  newContractorUserId: string | null = null;
  addingContractor = false;

  editContractorBranchesUserId: string | null = null;
  editContractorBranchesUserLabel = '';
  editContractorBranchesSelected: string[] = [];
  editContractorBranchesLoading = false;
  saveEditContractorBranchesLoading = false;
  editContractorBranchesError = '';

  states = [
    { code: 'AP', label: 'Andhra Pradesh' },
    { code: 'TG', label: 'Telangana' },
    { code: 'TN', label: 'Tamil Nadu' },
    { code: 'KA', label: 'Karnataka' },
  ];

  establishmentTypes = [
    { code: 'FACTORY', label: 'Factory' },
    { code: 'ESTABLISHMENT', label: 'Establishment' },
    { code: 'WAREHOUSE', label: 'Warehouse' },
    { code: 'SHOP', label: 'Shop' },
    { code: 'HO', label: 'Head Office (HO)' },
    { code: 'BRANCH', label: 'Branch Office' },
  ];

  compliancesBranch: BranchDto | null = null;
  compliances: any[] = [];
  compliancesLoading = false;
  compliancesError = '';
  compliancesSuccess = '';
  savingCompliances = false;

  selected = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private crmClientsApi: CrmClientsApi,
    private clientBranchesApi: ClientBranchesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.clientId = params.get('clientId') ?? '';
      this.resetState();
      if (!this.clientId) {
        this.err = 'Invalid client ID';
        return;
      }
      this.loadBranches();
    });
  }

  private resetState() {
    this.branches = [];
    this.editingBranch = null;
    this.contractorsBranch = null;
    this.contractors = [];
    this.compliancesBranch = null;
    this.compliances = [];
    this.compliancesSuccess = '';
    this.selected.clear();
    this.err = '';
    this.contractorsError = '';
    this.compliancesError = '';
  }

  private loadBranches(): void {
    this.isLoading = true;
    this.err = '';

    this.crmClientsApi.getBranchesForClient(this.clientId).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.isLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (branches) => {
        this.isLoading = false;
        this.branches = branches || [];
        this.loadCompliancePercent();
        this.cdr.detectChanges();
      },
      error: (e) => {
        if (e?.status === 401) {
          this.err = 'Unauthorized: Please log in.';
        } else if (e?.status === 403) {
          this.err = 'Forbidden: You do not have access.';
        } else if (e?.error?.message) {
          this.err = e.error.message;
        } else {
          this.err = 'Failed to load branches (unexpected error).';
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadCompliancePercent(): void {
    if (!this.branches.length) return;
    this.clientBranchesApi.getComplianceCompletion(this.selectedMonth).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res: any) => {
        const map = new Map<string, any>((res.items || []).map((x: any) => [x.branchId, x]));
        this.branches = this.branches.map((b: any) => ({
          ...b,
          completionPercent: (map.get(b.id) as any)?.completionPercent ?? 0,
          uploaded: (map.get(b.id) as any)?.uploaded ?? 0,
          totalApplicable: (map.get(b.id) as any)?.totalApplicable ?? 0,
        }));
        this.cdr.detectChanges();
      },
      error: () => { /* silently ignore */ }
    });
  }

  onCreateBranch(): void {
    if (!this.newBranch.branchName?.trim()) {
      return;
    }

    this.creatingBranch = true;
    this.err = '';
    this.createdBranchUser = null;

    const payload: CreateBranchRequest = {
      branchName: this.newBranch.branchName.trim(),
      branchType: this.newBranch.branchType || 'HO',
      address: this.newBranch.address || '',
      employeeCount: this.newBranch.employeeCount ?? 0,
      contractorCount: this.newBranch.contractorCount ?? 0,
      status: this.newBranch.status || 'ACTIVE',
      stateCode: this.newBranch.stateCode || 'TG',
      establishmentType: this.newBranch.establishmentType || 'BRANCH',
      branchUserName: this.newBranch.branchUserName?.trim() || undefined,
      branchUserEmail: this.newBranch.branchUserEmail?.trim() || undefined,
      branchUserPassword: this.newBranch.branchUserPassword?.trim() || undefined,
    };

    this.crmClientsApi.createBranch(this.clientId, payload).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (res: any) => {
        this.creatingBranch = false;
        // Show branch user credentials if created
        if (res?.branchUser) {
          this.createdBranchUser = {
            email: res.branchUser.email,
            password: res.branchUser.password,
          };
        }
        this.newBranch.branchName = '';
        this.newBranch.address = '';
        this.newBranch.employeeCount = 0;
        this.newBranch.contractorCount = 0;
        this.newBranch.branchType = 'HO';
        this.newBranch.status = 'ACTIVE';
        this.newBranch.stateCode = 'TG';
        this.newBranch.establishmentType = 'BRANCH';
        this.newBranch.branchUserName = '';
        this.newBranch.branchUserEmail = '';
        this.newBranch.branchUserPassword = '';
        this.loadBranches();
      },
      error: (e) => {
        this.creatingBranch = false;
        this.err = e?.error?.message || 'Failed to create branch';
      },
    });
  }

  startEditBranch(branch: BranchDto): void {
    this.editingBranch = { ...branch };
  }

  cancelEdit(): void {
    this.editingBranch = null;
    this.updatingBranch = false;
  }

  onUpdateBranch(): void {
    if (!this.editingBranch) return;
    if (!this.editingBranch.branchName?.trim()) return;

    this.updatingBranch = true;
    this.err = '';

    const payload: Partial<CreateBranchRequest> = {
      branchName: this.editingBranch.branchName.trim(),
      branchType: this.editingBranch.branchType,
      address: this.editingBranch.address,
      employeeCount: this.editingBranch.employeeCount,
      contractorCount: this.editingBranch.contractorCount,
      status: this.editingBranch.status,
      stateCode: (this.editingBranch as any).stateCode,
      establishmentType: (this.editingBranch as any).establishmentType,
    };

    this.crmClientsApi.updateBranch(this.editingBranch.id, payload).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: () => {
        this.updatingBranch = false;
        this.editingBranch = null;
        this.loadBranches();
      },
      error: (e) => {
        this.updatingBranch = false;
        this.err = e?.error?.message || 'Failed to update branch';
      },
    });
  }

  confirmDeleteBranch(branch: BranchDto): void {
    const ok = window.confirm(
      `Delete branch "${branch.branchName}"?`,
    );
    if (!ok) return;

    this.err = '';
    this.crmClientsApi.deleteBranch(branch.id).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: () => {
        if (this.editingBranch?.id === branch.id) {
          this.editingBranch = null;
        }
        if (this.contractorsBranch?.id === branch.id) {
          this.contractorsBranch = null;
          this.contractors = [];
        }
        this.loadBranches();
      },
      error: (e) => {
        this.err = e?.error?.message || 'Failed to delete branch';
      },
    });
  }

  showContractors(branch: BranchDto): void {
    this.contractorsBranch = branch;
    this.contractorsLoading = true;
    this.contractorsError = '';
    this.contractors = [];

    this.crmClientsApi.listBranchContractors(branch.id).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (items) => {
        this.contractors = items || [];
        this.contractorsLoading = false;
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.contractorsLoading = false;
        this.contractorsError =
          e?.error?.message || 'Failed to load contractors';
        this.cdr.detectChanges();
      },
    });
  }

  showCompliances(branch: BranchDto): void {
    this.compliancesBranch = branch;
    this.compliancesLoading = true;
    this.compliancesError = '';
    this.compliancesSuccess = '';
    this.compliances = [];
    this.selected.clear();

    this.crmClientsApi.listBranchCompliances(branch.id).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (items) => {
        this.compliances = items || [];
        // Pre-select items that are already mapped to this branch
        for (const item of this.compliances) {
          if (item.selected) {
            this.selected.add(item.complianceId);
          }
        }
        this.compliancesLoading = false;
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.compliancesLoading = false;
        this.compliancesError =
          e?.error?.message || 'Failed to load compliances';
        this.cdr.detectChanges();
      },
    });
  }

  onToggle(id: string, checked: boolean) {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
  }

  saveCompliances() {
    if (!this.compliancesBranch) return;
    this.savingCompliances = true;
    this.compliancesError = '';
    this.compliancesSuccess = '';

    const complianceIds = Array.from(this.selected);
    this.crmClientsApi.saveBranchCompliances(this.compliancesBranch.id, complianceIds)
      .pipe(takeUntil(this.destroy$), timeout(10000))
      .subscribe({
        next: (res) => {
          this.savingCompliances = false;
          this.compliancesSuccess = `Saved ${res?.count ?? complianceIds.length} compliance mapping(s) for this branch.`;
          this.cdr.detectChanges();
        },
        error: (e) => {
          this.savingCompliances = false;
          this.compliancesError = e?.error?.message || 'Failed to save compliance selections';
          this.cdr.detectChanges();
        },
      });
  }

  toggleAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.clear();
    if (checked) {
      for (const c of this.compliances) {
        this.selected.add(c.complianceId);
      }
    }
  }

  addContractor(): void {
    if (!this.contractorsBranch || this.newContractorUserId == null) return;

    this.addingContractor = true;
    this.contractorsError = '';

    this.crmClientsApi
      .addBranchContractor(this.contractorsBranch.id, this.newContractorUserId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.addingContractor = false;
          this.newContractorUserId = null;
          this.showContractors(this.contractorsBranch!);
        },
        error: (e) => {
          this.addingContractor = false;
          this.contractorsError =
            e?.error?.message || 'Failed to add contractor';
        },
      });
  }

  removeContractor(c: BranchContractorDto): void {
    if (!this.contractorsBranch) return;

    const ok = window.confirm(
      `Remove contractor ${c.name || c.email || 'this contractor'} from branch ${this.contractorsBranch.branchName}?`,
    );
    if (!ok) return;

    this.contractorsError = '';

    this.crmClientsApi
      .removeBranchContractor(this.contractorsBranch.id, c.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showContractors(this.contractorsBranch!);
        },
        error: (e) => {
          this.contractorsError =
            e?.error?.message || 'Failed to remove contractor';
        },
      });
  }

  openEditContractorBranches(c: BranchContractorDto): void {
    this.editContractorBranchesUserId = c.userId;
    this.editContractorBranchesUserLabel = c.name || c.email || 'Contractor';
    this.editContractorBranchesSelected = [];
    this.editContractorBranchesError = '';
    this.editContractorBranchesLoading = true;

    this.crmClientsApi.getContractorBranches(c.userId).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (res) => {
        this.editContractorBranchesSelected = (res?.branches || []).map((b) => b.id);
        this.editContractorBranchesLoading = false;
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.editContractorBranchesLoading = false;
        this.editContractorBranchesError =
          e?.error?.message || 'Failed to load contractor branches';
        this.cdr.detectChanges();
      },
    });
  }

  cancelEditContractorBranches(): void {
    this.editContractorBranchesUserId = null;
    this.editContractorBranchesUserLabel = '';
    this.editContractorBranchesSelected = [];
    this.editContractorBranchesError = '';
    this.editContractorBranchesLoading = false;
    this.saveEditContractorBranchesLoading = false;
  }

  saveEditContractorBranches(): void {
    if (!this.editContractorBranchesUserId) {
      return;
    }

    this.saveEditContractorBranchesLoading = true;
    this.editContractorBranchesError = '';

    const contractorId = this.editContractorBranchesUserId;
    const branchIds = this.editContractorBranchesSelected.slice();

    this.crmClientsApi.setContractorBranches(contractorId, branchIds).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: () => {
        this.saveEditContractorBranchesLoading = false;
        this.cancelEditContractorBranches();
      },
      error: (e) => {
        this.saveEditContractorBranchesLoading = false;
        this.editContractorBranchesError =
          e?.error?.message || 'Failed to save contractor branches';
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
