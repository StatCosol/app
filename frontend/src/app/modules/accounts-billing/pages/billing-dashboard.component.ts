import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { DashboardStats } from '../models/billing.models';

@Component({
  selector: 'app-billing-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Accounts & Billing</h1>
          <p class="text-sm text-slate-500 mt-1">Overview of invoices, payments and revenue</p>
        </div>
        <a routerLink="/admin/billing/create-invoice"
           class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          + New Invoice
        </a>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" *ngIf="stats">
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-slate-400 font-medium uppercase">Total Invoices</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ stats.totalInvoices }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-amber-500 font-medium uppercase">Draft</p>
          <p class="text-2xl font-bold text-amber-600 mt-1">{{ stats.draftCount }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-orange-500 font-medium uppercase">Pending Payment</p>
          <p class="text-2xl font-bold text-orange-600 mt-1">{{ stats.pendingPaymentCount }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-green-500 font-medium uppercase">Paid</p>
          <p class="text-2xl font-bold text-green-600 mt-1">{{ stats.paidCount }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4 shadow-sm">
          <p class="text-xs text-red-500 font-medium uppercase">Overdue</p>
          <p class="text-2xl font-bold text-red-600 mt-1">{{ stats.overdueCount }}</p>
        </div>
      </div>

      <!-- Revenue Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4" *ngIf="stats">
        <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow">
          <p class="text-sm opacity-80">Total Billed</p>
          <p class="text-3xl font-bold mt-1">₹{{ formatNum(stats.totalBilled) }}</p>
        </div>
        <div class="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white shadow">
          <p class="text-sm opacity-80">Total Received</p>
          <p class="text-3xl font-bold mt-1">₹{{ formatNum(stats.totalReceived) }}</p>
        </div>
        <div class="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 text-white shadow">
          <p class="text-sm opacity-80">Outstanding</p>
          <p class="text-3xl font-bold mt-1">₹{{ formatNum(stats.totalOutstanding) }}</p>
        </div>
      </div>

      <!-- Quick Links -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <a routerLink="/admin/billing/clients" class="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-700">Billing Clients</p>
            <p class="text-xs text-slate-400">Manage clients</p>
          </div>
        </a>
        <a routerLink="/admin/billing/invoices" class="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-700">All Invoices</p>
            <p class="text-xs text-slate-400">View & manage</p>
          </div>
        </a>
        <a routerLink="/admin/billing/payments" class="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-700">Payments</p>
            <p class="text-xs text-slate-400">Track receipts</p>
          </div>
        </a>
        <a routerLink="/admin/billing/settings" class="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-700">Settings</p>
            <p class="text-xs text-slate-400">Company profile</p>
          </div>
        </a>
      </div>
    </div>
  `,
})
export class BillingDashboardComponent implements OnInit {
  stats: DashboardStats | null = null;

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void {
    this.svc.getDashboardStats().subscribe((s) => (this.stats = s));
  }

  formatNum(n: number): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
