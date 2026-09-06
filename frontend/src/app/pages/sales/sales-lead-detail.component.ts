import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  Lead,
  LeadActivity,
  LeadActivityOutcome,
  LeadActivityType,
  LeadStage,
  SalesService,
} from '../../modules/sales/sales.service';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-sales-lead-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent],
  template: `
    @if (loading) {
<div class="text-center text-gray-500 py-10">Loading…</div>
}

    @if (!loading && lead) {
<div class="space-y-5">
      <ui-page-header
        [title]="lead.companyName"
        [subtitle]="lead.leadNo + ' · created ' + (lead.createdAt | date:'mediumDate')"
        [breadcrumbs]="[{ label: 'Leads', route: '/sales/leads' }, { label: lead.companyName }]">
        <span class="text-xs px-2.5 py-1 rounded font-medium" [ngClass]="stageClass(lead.stage)">{{ lead.stage }}</span>
      </ui-page-header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Lead summary -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-3 lg:col-span-1">
          <h3 class="font-semibold text-gray-900 mb-2">Lead Info</h3>
          <div class="text-sm space-y-1.5">
            <div><span class="text-gray-500">Contact:</span> {{ lead.contactName || '—' }}@if (lead.designation) {
<span> ({{ lead.designation }})</span>
}</div>
            <div><span class="text-gray-500">Phone:</span> {{ lead.contactPhone || '—' }}</div>
            <div><span class="text-gray-500">Email:</span> {{ lead.contactEmail || '—' }}</div>
            <div><span class="text-gray-500">Industry:</span> {{ lead.industry || '—' }}</div>
            <div><span class="text-gray-500">Location:</span> {{ lead.city || '—' }}@if (lead.state) {
<span>, {{ lead.state }}</span>
}</div>
            <div><span class="text-gray-500">Employees:</span> {{ lead.employeeCount ?? '—' }}</div>
            <div><span class="text-gray-500">Source:</span> {{ lead.source }}@if (lead.sourceDetail) {
<span> · {{ lead.sourceDetail }}</span>
}</div>
            <div><span class="text-gray-500">Value:</span> ₹ {{ +lead.estimatedValue | number:'1.0-0' }} ({{ lead.probability }}%)</div>
            <div><span class="text-gray-500">Expected close:</span> {{ lead.expectedCloseDate || '—' }}</div>
            <div><span class="text-gray-500">Next follow-up:</span>
              <span [class.text-red-600]="isOverdue(lead.nextFollowupAt)">{{ lead.nextFollowupAt ? (lead.nextFollowupAt | date:'medium') : '—' }}</span>
            </div>
            @if (lead.description) {
<div class="text-gray-700 mt-2 border-t pt-2">{{ lead.description }}</div>
}
          </div>

          <div class="border-t pt-3 space-y-2">
            <label class="block text-xs font-medium text-gray-600">Update stage</label>
            <select [(ngModel)]="newStage" (change)="updateStage()" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              @for (s of stages; track s) {
<option [value]="s">{{ s }}</option>
}
            </select>
          </div>
        </div>

        <!-- Activity log + add -->
        <div class="lg:col-span-2 space-y-5">
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="font-semibold text-gray-900 mb-3">Log Activity</h3>
            <form (submit)="$event.preventDefault(); logActivity()" class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select [(ngModel)]="act.activityType" name="activityType" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  @for (t of activityTypes; track t) {
<option [value]="t">{{ t }}</option>
}
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Outcome</label>
                <select [(ngModel)]="act.outcome" name="outcome" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option [ngValue]="undefined">—</option>
                  @for (o of outcomes; track o) {
<option [value]="o">{{ o }}</option>
}
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input [(ngModel)]="act.subject" name="subject" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea [(ngModel)]="act.notes" name="notes" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"></textarea>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Next follow-up</label>
                <input [(ngModel)]="act.nextFollowupAt" name="nextFollowupAt" type="datetime-local" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div class="flex items-end justify-end">
                <button type="submit" [disabled]="logging" class="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                  {{ logging ? 'Saving…' : 'Log Activity' }}
                </button>
              </div>
            </form>
          </div>

          <div class="bg-white rounded-xl border border-gray-200">
            <div class="px-5 py-3 border-b border-gray-200 font-semibold text-gray-900">Activity History</div>
            @if (activities.length === 0) {
<div class="p-6 text-center text-gray-500 text-sm">No activities logged yet.</div>
}
            <ul class="divide-y divide-gray-100">
              @for (a of activities; track a) {
<li class="px-5 py-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm">
                      <span class="font-semibold text-gray-900">{{ a.activityType }}</span>
                      @if (a.outcome) {
<span class="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{{ a.outcome }}</span>
}
                    </div>
                    @if (a.subject) {
<div class="text-sm text-gray-700 mt-0.5">{{ a.subject }}</div>
}
                    @if (a.notes) {
<div class="text-xs text-gray-600 mt-1 whitespace-pre-line">{{ a.notes }}</div>
}
                  </div>
                  <div class="text-xs text-gray-500 text-right shrink-0">
                    <div>{{ a.occurredAt | date:'medium' }}</div>
                    @if (a.nextFollowupAt) {
<div class="text-emerald-700">Next: {{ a.nextFollowupAt | date:'short' }}</div>
}
                  </div>
                </div>
              </li>
}
            </ul>
          </div>
        </div>
      </div>
    </div>
}
  `,
})
export class SalesLeadDetailComponent implements OnInit {
  loading = true;
  lead: Lead | null = null;
  activities: LeadActivity[] = [];
  newStage: LeadStage = 'NEW';
  logging = false;

  stages: LeadStage[] = ['NEW','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','AGREEMENT_SENT','WON','LOST','ON_HOLD'];
  activityTypes: LeadActivityType[] = ['CALL','EMAIL','WHATSAPP','MEETING','PROPOSAL','AGREEMENT','NOTE'];
  outcomes: LeadActivityOutcome[] = ['NO_ANSWER','INTERESTED','NOT_INTERESTED','FOLLOW_UP','PROPOSAL_SENT','AGREEMENT_SIGNED','DECLINED','OTHER'];

  act: {
    activityType: LeadActivityType;
    outcome?: LeadActivityOutcome;
    subject?: string;
    notes?: string;
    nextFollowupAt?: string;
  } = { activityType: 'CALL' };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: SalesService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.load(id);
  }

  private load(id: string): void {
    this.loading = true;
    this.svc.get(id).subscribe({
      next: (l) => {
        this.lead = l;
        this.newStage = l.stage;
        this.loading = false;
        this.svc.listActivities(id).subscribe((a) => (this.activities = a));
      },
      error: () => { this.loading = false; },
    });
  }

  logActivity(): void {
    if (!this.lead) return;
    this.logging = true;
    const body: any = { ...this.act };
    if (body.nextFollowupAt) body.nextFollowupAt = new Date(body.nextFollowupAt).toISOString();
    this.svc.addActivity(this.lead.id, body).subscribe({
      next: () => {
        this.logging = false;
        this.act = { activityType: 'CALL' };
        this.load(this.lead!.id);
      },
      error: () => { this.logging = false; },
    });
  }

  updateStage(): void {
    if (!this.lead || this.newStage === this.lead.stage) return;
    this.svc.update(this.lead.id, { stage: this.newStage }).subscribe({
      next: (l) => { this.lead = l; },
    });
  }

  stageClass(stage: LeadStage): string {
    const map: Record<LeadStage, string> = {
      NEW: 'bg-brand-50 text-brand-700',
      CONTACTED: 'bg-cyan-50 text-cyan-700',
      QUALIFIED: 'bg-violet-50 text-violet-700',
      PROPOSAL_SENT: 'bg-amber-50 text-amber-700',
      NEGOTIATION: 'bg-orange-50 text-orange-700',
      AGREEMENT_SENT: 'bg-yellow-50 text-yellow-700',
      WON: 'bg-emerald-100 text-emerald-800',
      LOST: 'bg-rose-50 text-rose-700',
      ON_HOLD: 'bg-gray-100 text-gray-700',
    };
    return map[stage];
  }

  isOverdue(d: string | null): boolean {
    return !!d && new Date(d).getTime() <= Date.now();
  }
}
