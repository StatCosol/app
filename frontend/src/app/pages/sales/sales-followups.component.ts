import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Lead, SalesService } from '../../modules/sales/sales.service';

@Component({
  selector: 'app-sales-followups',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-5">
      <h2 class="text-2xl font-bold text-gray-900">My Follow-ups</h2>
      <p class="text-sm text-gray-600">Open leads where the next follow-up time has passed.</p>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        @if (loading) {
<div class="p-6 text-center text-gray-500">Loading…</div>
}
        @if (!loading && items.length === 0) {
<div class="p-10 text-center text-gray-500">All caught up. 🎉</div>
}
        @if (!loading && items.length > 0) {
<table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="text-left px-4 py-2.5">Company</th>
              <th class="text-left px-4 py-2.5">Stage</th>
              <th class="text-left px-4 py-2.5">Due</th>
              <th class="text-left px-4 py-2.5">Last Activity</th>
              <th class="text-right px-4 py-2.5">Value</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            @for (l of items; track l) {
<tr class="border-t border-gray-100 hover:bg-emerald-50/30">
              <td class="px-4 py-2.5 font-medium text-gray-900">{{ l.companyName }}</td>
              <td class="px-4 py-2.5"><span class="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{{ l.stage }}</span></td>
              <td class="px-4 py-2.5 text-red-600 text-xs">{{ l.nextFollowupAt | date:'medium' }}</td>
              <td class="px-4 py-2.5 text-xs text-gray-600">{{ l.lastActivityAt ? (l.lastActivityAt | date:'short') : '—' }}</td>
              <td class="px-4 py-2.5 text-right text-gray-700">₹ {{ +l.estimatedValue | number:'1.0-0' }}</td>
              <td class="px-4 py-2.5 text-right">
                <a [routerLink]="['/sales/leads', l.id]" class="text-emerald-600 hover:underline text-sm">Open →</a>
              </td>
            </tr>
}
          </tbody>
        </table>
}
      </div>
    </div>
  `,
})
export class SalesFollowupsComponent implements OnInit {
  loading = true;
  items: Lead[] = [];

  constructor(private svc: SalesService) {}

  ngOnInit(): void {
    this.svc.myFollowups().subscribe({
      next: (r) => { this.items = r; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
}
