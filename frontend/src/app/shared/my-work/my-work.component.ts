import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { WorkItem, WorkResult } from './my-work.models';

@Component({
  selector: 'app-my-work',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './my-work.component.html',
  styleUrl: './my-work.component.scss',
})
export class MyWorkComponent implements OnInit, OnDestroy {
  result = signal<WorkResult | null>(null);
  loading = signal(false);
  error = signal('');
  selected = signal<WorkItem | null>(null);
  company = '';
  branch = '';
  month = '';
  module = '';
  search = '';
  view = 'active';
  page = 1;
  companies: WorkResult['companies'] = [];
  branches: WorkResult['branches'] = [];
  modules: string[] = [];
  readonly cards = [
    { key: 'active', label: 'Needs attention' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'soon', label: 'Due within 7 days' },
    { key: 'returned', label: 'Needs correction' },
    { key: 'closed', label: 'Closed' },
    { key: 'all', label: 'All tasks' },
  ];
  private routeRequest?: Subscription;
  private request?: Subscription;
  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
  ) {}
  ngOnInit() {
    this.routeRequest = this.route.queryParamMap.subscribe((p) => {
      this.company = p.get('clientId') || '';
      this.branch = p.get('branchId') || '';
      this.month = p.get('month') || '';
      this.module = p.get('module') || '';
      this.search = p.get('q') || '';
      this.view = this.cards.some((c) => c.key === p.get('view')) ? p.get('view')! : 'active';
      this.page = Math.max(1, Number(p.get('page')) || 1);
      this.load();
    });
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
    this.routeRequest?.unsubscribe();
  }
  get visibleBranches() {
    return this.branches.filter((b) => !this.company || b.clientId === this.company);
  }
  get portal() {
    return this.router.url.split('/')[1];
  }
  get introduction() {
    return (
      (
        {
          branch:
            'Prepare submissions, correct returned evidence and keep your branches on schedule.',
          client: 'Follow up with your branches and track outstanding submissions.',
          contractor: 'Complete your assigned submissions and correct returned evidence.',
          crm: 'Review submissions and coordinate the next step with each responsible owner.',
          auditor: 'Review assigned evidence and follow up on unresolved findings.',
          payroll: 'Prioritize assigned payroll work and resolve outstanding inputs.',
          cco: 'Follow up on work within your managed companies.',
          ceo: 'Review the work assigned to your management queue.',
          admin: 'Review your assigned operational work.',
        } as Record<string, string>
      )[this.portal] || 'Review your assigned work and its next step.'
    );
  }
  update(resetPage = true) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        clientId: this.company || null,
        branchId: this.branch || null,
        month: this.month || null,
        module: this.module || null,
        q: this.search.trim() || null,
        view: this.view,
        page: resetPage ? 1 : this.page,
      },
    });
  }
  companyChanged() {
    this.branch = '';
    this.update();
  }
  chooseView(view: string) {
    this.view = view;
    this.update();
  }
  reset() {
    this.company = '';
    this.branch = '';
    this.month = '';
    this.module = '';
    this.search = '';
    this.view = 'active';
    this.update();
  }
  changePage(delta: number) {
    this.page = (this.result()?.pagination.page || 1) + delta;
    this.update(false);
  }
  load() {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.selected.set(null);
    let params = new HttpParams().set('view', this.view).set('page', this.page).set('limit', 25);
    for (const [k, v] of Object.entries({
      clientId: this.company,
      branchId: this.branch,
      month: this.month,
      module: this.module,
      q: this.search.trim(),
    }))
      if (v) params = params.set(k, v);
    this.request = this.http
      .get<WorkResult>(`${environment.apiBaseUrl}/api/v1/tasks/workspace`, { params })
      .subscribe({
        next: (r) => {
          this.result.set(r);
          this.companies = r.companies;
          this.branches = r.branches;
          this.modules = r.modules;
          this.page = r.pagination.page;
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Your work could not be loaded. Check your filters or try again.');
          this.loading.set(false);
        },
      });
  }
  label(value: string) {
    return value
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
  nextStep(item: WorkItem) {
    if (['CLOSED', 'CANCELLED'].includes(item.status))
      return 'This task is no longer active. Check the source record for its approval or verification history.';
    if (item.status === 'AWAITING_REUPLOAD')
      return 'Read the reviewer remarks in the source record, correct the evidence and resubmit for review.';
    if (item.status === 'REUPLOADED')
      return 'The evidence was resubmitted. Open the source record and follow the review step permitted for your role.';
    if (['client', 'cco', 'ceo'].includes(this.portal))
      return 'Follow up with the responsible owner and confirm progress in the source record.';
    if (this.portal === 'auditor')
      return 'Open the assigned audit, compare the evidence with the requirement and record your finding.';
    return 'Open the work area, locate this task and complete the next permitted step. Review any outstanding remarks first.';
  }
  workArea(item: WorkItem): string | null {
    if (this.portal === 'contractor')
      return item.module === 'PAYROLL' ? '/contractor/payroll-computation' : '/contractor/tasks';
    if (this.portal === 'auditor' && item.module === 'AUDIT') return '/auditor/audits';
    if (this.portal === 'payroll' && item.module === 'PAYROLL') return '/payroll/clients';
    if (this.portal === 'cco' && item.module === 'PAYROLL') return '/cco/payroll-approvals';
    if (this.portal === 'crm')
      return (
        (
          {
            COMPLIANCE: '/crm/compliance/tasks',
            AUDIT: '/crm/audits',
            RETURNS: '/crm/returns',
            RENEWAL: '/crm/renewals',
          } as Record<string, string>
        )[item.module] || null
      );
    if (
      ['client', 'branch'].includes(this.portal) &&
      item.module === 'COMPLIANCE' &&
      this.auth.hasModule('EMPLOYEE_COMPLIANCE')
    )
      return `/${this.portal}/compliance/status`;
    if (
      this.portal === 'client' &&
      item.module === 'RETURNS' &&
      this.auth.hasModule('EMPLOYEE_COMPLIANCE')
    )
      return '/client/compliance/returns';
    return null;
  }
}
