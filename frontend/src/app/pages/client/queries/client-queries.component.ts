import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { ClientQueriesService } from '../../../core/client-queries.service';
import { AuthService } from '../../../core/auth.service';
import { PageHeaderComponent, FormInputComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-queries',
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent, FormInputComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './client-queries.component.html',
  styleUrls: ['./client-queries.component.scss'],
})
export class ClientQueriesComponent {
  tab: 'raise'|'threads' = 'raise';
  loading = false;
  submitting = false;

  form: any = {
    queryType: 'COMPLIANCE', // TECHNICAL | COMPLIANCE | AUDIT
    subject: '',
    message: '',
    clientId: '',
    branchId: '',
  };

  threads: any[] = [];

  constructor(private api: ClientQueriesService, private router: Router, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    const u = this.auth.getUser();
    if (u?.clientId) this.form.clientId = String(u.clientId);
    this.loadThreads();
  }

  loadThreads() {
    this.loading = true;
    this.api.listMyThreads().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res:any) => { this.threads = res?.data || res || []; this.cdr.detectChanges(); },
      error: () => { this.cdr.detectChanges(); }
    });
  }

  submit() {
    if (this.submitting) return;
    // Message is required; subject will be auto-filled in service if blank/too short.
    if (!this.form.message) return;
    // ClientId is required for COMPLIANCE/AUDIT routing to assigned CRM/Auditor.
    if ((this.form.queryType === 'COMPLIANCE' || this.form.queryType === 'AUDIT') && !this.form.clientId) return;
    this.submitting = true;
    this.api.raiseQuery(this.form).subscribe({
      next: () => {
        this.submitting = false;
        this.form.subject = '';
        this.form.message = '';
        this.tab = 'threads';
        this.cdr.detectChanges();
        this.loadThreads();
      },
      error: () => { this.submitting = false; this.cdr.detectChanges(); }
    });
  }

  openThread(t:any){
    this.router.navigate(['/client/queries', t.id]);
  }

  slaText(t:any){
    if (t.resolvedAt) return 'Resolved';
    if (!t.slaDueAt) return 'Open';
    const due = new Date(t.slaDueAt);
    const now = new Date();
    const hrs = Math.ceil((due.getTime()-now.getTime())/(1000*60*60));
    if (t.escalatedLevel === 'CEO') return 'Escalated to CEO';
    if (t.escalatedLevel === 'CCO') return 'Escalated to CCO';
    if (hrs <= 0) return 'SLA Breached';
    return `Response due in ${hrs}h`;
  }

  getSlaClass(t: any): string {
    const text = this.slaText(t);
    if (text === 'Resolved') return 'bg-green-100 text-green-700';
    if (text.includes('Breached') || text.includes('Escalated')) return 'bg-red-100 text-red-700';
    if (text === 'Open') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  }
}
