import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import {
  EssApiService,
  EssProfile,
  LeaveBalance,
  EssNomination,
  Payslip,
  StatutoryDetails,
  ContributionRow,
  LeaveApplication,
} from '../ess-api.service';

interface TimelineEntry {
  icon: string;
  color: string;
  label: string;
  meta: string;
}

@Component({
  selector: 'app-ess-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dash">
      <!-- ===== GREETING ===== -->
      <div class="greeting">
        <div>
          <h1 class="greet-title">Welcome back, {{ profile?.firstName || 'Employee' }}</h1>
          <p class="greet-sub">Here's your snapshot for {{ todayLabel }}</p>
        </div>
      </div>

      <!-- ===== SKELETON ===== -->
      <div *ngIf="loading" class="kpi-row">
        <div class="kpi skeleton" *ngFor="let _ of [1,2,3,4]">
          <div class="sk-pill"></div>
          <div class="sk-val"></div>
          <div class="sk-sub"></div>
        </div>
      </div>

      <!-- ===== KPI CARDS ===== -->
      <div *ngIf="!loading" class="kpi-row">
        <!-- Net Pay -->
        <a routerLink="/ess/payslips" class="kpi kpi-indigo">
          <div class="kpi-head">
            <div class="kpi-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg></div>
            <span class="kpi-tag">NET PAY</span>
          </div>
          <div class="kpi-val">{{ netPay }}</div>
          <div class="kpi-sub">{{ payslipMonth }}</div>
        </a>

        <!-- PF -->
        <a routerLink="/ess/pf" class="kpi kpi-blue">
          <div class="kpi-head">
            <div class="kpi-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"/></svg></div>
            <span class="kpi-tag">PF / UAN</span>
          </div>
          <div class="kpi-val">{{ statutory?.pf?.uan || 'N/A' }}</div>
          <div class="kpi-sub">{{ lastPfContrib }}</div>
        </a>

        <!-- ESI -->
        <a routerLink="/ess/esi" class="kpi kpi-emerald">
          <div class="kpi-head">
            <div class="kpi-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg></div>
            <span class="kpi-tag">ESI / IP</span>
          </div>
          <div class="kpi-val">{{ statutory?.esi?.ipNumber || 'N/A' }}</div>
          <div class="kpi-sub">{{ lastEsiContrib }}</div>
        </a>

        <!-- Leave Balance -->
        <a routerLink="/ess/leave" class="kpi kpi-amber">
          <div class="kpi-head">
            <div class="kpi-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg></div>
            <span class="kpi-tag">LEAVE</span>
          </div>
          <div class="kpi-val">{{ totalLeaveAvailable }} <small>days</small></div>
          <div class="kpi-sub">{{ leaveSummary }}</div>
        </a>
      </div>

      <!-- ===== QUICK ACTIONS ===== -->
      <div *ngIf="!loading" class="section">
        <h2 class="sec-title">Quick Actions</h2>
        <div class="qa-row">
          <a routerLink="/ess/payslips" class="qa">
            <div class="qa-icon qa-indigo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></div>
            <span>Download Payslip</span>
          </a>
          <a routerLink="/ess/leave" class="qa">
            <div class="qa-icon qa-emerald"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
            <span>Apply Leave</span>
          </a>
          <a routerLink="/ess/nominations" class="qa">
            <div class="qa-icon qa-purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/></svg></div>
            <span>Nominations</span>
          </a>
          <a routerLink="/ess/profile" class="qa">
            <div class="qa-icon qa-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg></div>
            <span>My Profile</span>
          </a>
        </div>
      </div>

      <!-- ===== RECENT ACTIVITY ===== -->
      <div *ngIf="!loading && timeline.length" class="section">
        <h2 class="sec-title">Recent Activity</h2>
        <div class="timeline-card">
          <div class="tl-entry" *ngFor="let e of timeline; let last = last" [class.tl-last]="last">
            <div class="tl-dot" [style.background]="e.color"></div>
            <div class="tl-body">
              <span class="tl-label" [innerHTML]="e.icon + ' ' + e.label"></span>
              <span class="tl-meta">{{ e.meta }}</span>
            </div>
          </div>
          <div *ngIf="!timeline.length" class="tl-empty">No recent activity to show.</div>
        </div>
      </div>

      <!-- ===== LEAVE TABLE ===== -->
      <div *ngIf="!loading && leaveBalances.length" class="section">
        <h2 class="sec-title">Leave Balances ({{ currentYear }})</h2>
        <div class="table-card">
          <table>
            <thead>
              <tr>
                <th class="txt-l">Type</th>
                <th>Opening</th>
                <th>Accrued</th>
                <th>Used</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of leaveBalances">
                <td class="txt-l fw-500">{{ b.leaveType }}</td>
                <td>{{ b.opening }}</td>
                <td>{{ b.accrued }}</td>
                <td>{{ b.used }}</td>
                <td [class.clr-green]="+(b.available) > 0" [class.clr-red]="+(b.available) <= 0" class="fw-600">{{ b.available }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { font-family: 'Inter', system-ui, -apple-system, sans-serif; }

    .dash { max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

    /* greeting */
    .greeting { padding: 4px 0; }
    .greet-title { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -.4px; }
    .greet-sub { font-size: 14px; color: #64748b; margin-top: 2px; }

    /* KPI ROW */
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 1024px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 540px) { .kpi-row { grid-template-columns: 1fr; } }

    .kpi {
      background: #fff; border-radius: 16px; padding: 20px;
      text-decoration: none; color: inherit;
      border: 1px solid #e5e7eb;
      transition: box-shadow .2s, transform .15s;
      cursor: pointer;
    }
    .kpi:hover { box-shadow: 0 6px 20px rgba(0,0,0,.06); transform: translateY(-2px); }

    .kpi-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .kpi-badge {
      width: 38px; height: 38px; border-radius: 10px;
      display: grid; place-items: center;
    }
    .kpi-badge svg { width: 20px; height: 20px; }
    .kpi-tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
    .kpi-val { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -.3px; }
    .kpi-val small { font-size: 13px; font-weight: 600; color: #64748b; }
    .kpi-sub { font-size: 13px; color: #64748b; margin-top: 2px; }

    /* color accents */
    .kpi-indigo .kpi-badge { background: #eef2ff; color: #4f46e5; }
    .kpi-indigo .kpi-tag { color: #4f46e5; }
    .kpi-blue .kpi-badge { background: #eff6ff; color: #2563eb; }
    .kpi-blue .kpi-tag { color: #2563eb; }
    .kpi-emerald .kpi-badge { background: #ecfdf5; color: #059669; }
    .kpi-emerald .kpi-tag { color: #059669; }
    .kpi-amber .kpi-badge { background: #fffbeb; color: #d97706; }
    .kpi-amber .kpi-tag { color: #d97706; }

    /* Skeleton */
    .skeleton { pointer-events: none; }
    .sk-pill { width: 80px; height: 12px; border-radius: 6px; background: #e5e7eb; margin-bottom: 14px; animation: pulse 1.2s ease-in-out infinite alternate; }
    .sk-val  { width: 120px; height: 20px; border-radius: 6px; background: #e5e7eb; margin-bottom: 8px;  animation: pulse 1.2s ease-in-out infinite alternate; }
    .sk-sub  { width: 90px; height: 10px; border-radius: 6px; background: #f3f4f6; animation: pulse 1.2s ease-in-out infinite alternate; }
    @keyframes pulse { from { opacity: 1; } to { opacity: .45; } }

    /* SECTIONS */
    .section {}
    .sec-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }

    /* QUICK ACTIONS */
    .qa-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    @media (max-width: 700px) { .qa-row { grid-template-columns: repeat(2, 1fr); } }
    .qa {
      display: flex; align-items: center; gap: 12px;
      background: #fff; border: 1px solid #e5e7eb;
      border-radius: 12px; padding: 14px 16px;
      text-decoration: none; color: #0f172a;
      font-size: 14px; font-weight: 600;
      transition: box-shadow .15s, transform .12s;
    }
    .qa:hover { box-shadow: 0 4px 14px rgba(0,0,0,.05); transform: translateY(-1px); }
    .qa-icon {
      width: 38px; height: 38px; flex-shrink: 0;
      border-radius: 10px; display: grid; place-items: center;
    }
    .qa-icon svg { width: 20px; height: 20px; }
    .qa-indigo { background: #eef2ff; color: #4f46e5; }
    .qa-emerald { background: #ecfdf5; color: #059669; }
    .qa-purple { background: #f5f3ff; color: #7c3aed; }
    .qa-blue { background: #eff6ff; color: #2563eb; }

    /* TIMELINE */
    .timeline-card {
      background: #fff; border: 1px solid #e5e7eb;
      border-radius: 14px; padding: 20px 22px;
    }
    .tl-entry {
      display: flex; align-items: flex-start; gap: 14px;
      padding-bottom: 16px; margin-bottom: 16px;
      border-bottom: 1px solid #f3f4f6;
      position: relative;
    }
    .tl-entry.tl-last { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
    .tl-dot {
      width: 10px; height: 10px; border-radius: 50%;
      flex-shrink: 0; margin-top: 5px;
    }
    .tl-body { display: flex; flex-direction: column; gap: 2px; }
    .tl-label { font-size: 14px; color: #1e293b; }
    .tl-meta { font-size: 12px; color: #94a3b8; }
    .tl-empty { font-size: 14px; color: #94a3b8; text-align: center; padding: 12px; }

    /* TABLE */
    .table-card {
      background: #fff; border: 1px solid #e5e7eb;
      border-radius: 14px; padding: 4px; overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #64748b; padding: 10px 14px; text-align: right; border-bottom: 1px solid #e5e7eb; }
    td { padding: 10px 14px; text-align: right; border-bottom: 1px solid #f3f4f6; color: #334155; }
    .txt-l { text-align: left; }
    .fw-500 { font-weight: 500; }
    .fw-600 { font-weight: 600; }
    .clr-green { color: #059669; }
    .clr-red { color: #dc2626; }
  `],
})
export class EssDashboardComponent implements OnInit {
  loading = true;
  profile: EssProfile | null = null;
  statutory: StatutoryDetails | null = null;
  contributions: ContributionRow[] = [];
  leaveBalances: LeaveBalance[] = [];
  leaveApps: LeaveApplication[] = [];
  nominations: EssNomination[] = [];
  payslips: Payslip[] = [];
  timeline: TimelineEntry[] = [];
  currentYear = new Date().getFullYear();

  private monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  get todayLabel(): string {
    const d = new Date();
    return `${d.toLocaleDateString('en-IN', { weekday: 'long' })}, ${d.getDate()} ${this.monthNames[d.getMonth()]} ${d.getFullYear()}`;
  }

  get netPay(): string {
    if (!this.payslips.length) return '--';
    // We don't have net pay in the payslip list — show "Available" or last month label
    const p = this.payslips[0];
    return `${this.monthNames[(p.periodMonth || 1) - 1]} ${p.periodYear}`;
  }

  get payslipMonth(): string {
    if (!this.payslips.length) return 'No payslips yet';
    return 'Latest payslip available';
  }

  get lastPfContrib(): string {
    const c = this.contributions[0];
    if (!c) return 'No contributions';
    return `Last: ${this.monthNames[(c.periodMonth || 1) - 1]} ${c.periodYear}`;
  }

  get lastEsiContrib(): string {
    const c = this.contributions[0];
    if (!c) return 'No contributions';
    return `Last: ${this.monthNames[(c.periodMonth || 1) - 1]} ${c.periodYear}`;
  }

  get totalLeaveAvailable(): number {
    return this.leaveBalances.reduce((sum, b) => sum + parseFloat(b.available || '0'), 0);
  }

  get leaveSummary(): string {
    if (!this.leaveBalances.length) return 'No leave data';
    const types = this.leaveBalances.map(b => `${b.leaveType} ${b.available}`).slice(0, 3).join(' · ');
    return types;
  }

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    forkJoin({
      profile: this.api.getProfile(),
      statutory: this.api.getStatutory(),
      contributions: this.api.getContributions(),
      balances: this.api.getLeaveBalances(),
      leaveApps: this.api.listLeaveApplications(),
      nominations: this.api.listNominations(),
      payslips: this.api.listPayslips(),
    })
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => {
          this.profile = res.profile;
          this.statutory = res.statutory;
          this.contributions = res.contributions ?? [];
          this.leaveBalances = res.balances ?? [];
          this.leaveApps = res.leaveApps ?? [];
          this.nominations = res.nominations ?? [];
          this.payslips = res.payslips ?? [];
          this.buildTimeline();
        },
        error: () => {},
      });
  }

  private buildTimeline(): void {
    const entries: TimelineEntry[] = [];

    // Recent payslips
    for (const p of this.payslips.slice(0, 2)) {
      entries.push({
        icon: '📄',
        color: '#6366f1',
        label: `Payslip generated for ${this.monthNames[(p.periodMonth || 1) - 1]} ${p.periodYear}`,
        meta: p.generatedAt ? new Date(p.generatedAt).toLocaleDateString('en-IN') : '',
      });
    }

    // Recent leave decisions
    for (const la of this.leaveApps.filter(a => a.status !== 'PENDING').slice(0, 3)) {
      const approved = la.status === 'APPROVED';
      entries.push({
        icon: approved ? '✅' : '❌',
        color: approved ? '#059669' : '#dc2626',
        label: `Leave ${la.status.toLowerCase()} — ${la.leaveType} (${la.totalDays}d)`,
        meta: la.actionedAt ? new Date(la.actionedAt).toLocaleDateString('en-IN') : la.fromDate || '',
      });
    }

    // Nominations
    for (const n of this.nominations.filter(n => n.status !== 'DRAFT').slice(0, 2)) {
      const col = n.status === 'APPROVED' ? '#059669' : n.status === 'REJECTED' ? '#dc2626' : '#d97706';
      entries.push({
        icon: '👥',
        color: col,
        label: `${n.nominationType} nomination ${n.status.toLowerCase()}`,
        meta: n.submittedAt ? new Date(n.submittedAt).toLocaleDateString('en-IN') : '',
      });
    }

    // Sort by date (most recent first) — best effort
    this.timeline = entries.slice(0, 6);
  }
}
