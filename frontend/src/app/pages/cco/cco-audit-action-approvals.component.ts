import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AuditsService } from '../../core/audits.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { PageHeaderComponent, ActionButtonComponent, LoadingSpinnerComponent } from '../../shared/ui';

@Component({
  selector:'app-cco-audit-action-approvals',standalone:true,
  imports:[CommonModule,FormsModule,PageHeaderComponent,ActionButtonComponent,LoadingSpinnerComponent],
  template:`<section class="approvals">
    <ui-page-header title="Audit Action Approvals" subtitle="Review requests to cancel audits or delete unused schedules. Approval rechecks the latest audit and report state." />
    <div class="filters aligned-filter-controls">
      <label>Status<select [(ngModel)]="status"><option value="PENDING_CCO">Pending CCO</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="">All</option></select></label>
      <label>Search<input [(ngModel)]="search" placeholder="Client, branch, contractor or audit reference"></label>
      <ui-button variant="secondary" icon="refresh" [disabled]="loading || busy" (clicked)="load()">Refresh</ui-button>
    </div>
    @if(message){<p role="status">{{message}}</p>}
    @if(error){<p role="alert" class="error">{{error}}</p>}
    @if(loading){<ui-loading-spinner text="Loading audit action requests..." />}
    @for(row of visibleRows;track row.id){
      <article>
        <h2>{{row.action === 'DELETE' ? 'Delete unused schedule' : 'Cancel audit'}} · {{row.audit_snapshot.audit_code || row.audit_id}}</h2>
        <p><strong>{{row.audit_snapshot.clientName || 'Client unavailable'}}</strong> · {{row.audit_snapshot.branchName || 'Branch unavailable'}}</p>
        <p>{{row.audit_snapshot.audit_type}} · {{row.audit_snapshot.period_code}} · Contractor: {{row.audit_snapshot.contractorName || 'Not applicable'}}</p>
        <p>Requested by {{row.requestedByName || 'Unavailable'}} · {{row.requested_at | date:'medium'}} · {{row.status}}</p>
        <p>Current audit: {{row.currentAuditStatus || 'Removed'}}. {{row.action === 'DELETE' ? 'Deletion permanently removes only an unused planned schedule. Evidence or reports block deletion.' : 'Cancellation retains evidence and review history.'}}</p>
        <p class="note"><strong>Reason:</strong> {{row.reason}}</p>
        @if(row.review_note){<p class="note"><strong>CCO review:</strong> {{row.review_note}} · {{row.reviewedByName}} · {{row.reviewed_at | date:'medium'}}</p>}
        @if(row.status === 'PENDING_CCO'){
          <div class="actions"><ui-button icon="check-circle" [disabled]="busy" (clicked)="review(row,'APPROVE')">{{row.action === 'DELETE' ? 'Approve deletion' : 'Approve cancellation'}}</ui-button><ui-button variant="danger" icon="x-circle" [disabled]="busy" (clicked)="review(row,'REJECT')">Reject request</ui-button></div>
        }
      </article>
    } @empty { @if(!loading && !error){<p>No audit action requests match these filters.</p>} }
    <p class="hint">Up to 500 requests, pending first. Reports continue through their existing review workflow.</p>
  </section>`,
  styles:[`.approvals{max-width:1100px;margin:auto;padding:24px;display:grid;gap:20px;color:var(--text-primary,#193e35)}.filters,.actions{display:flex;align-items:end;flex-wrap:wrap;gap:12px}label{display:grid;gap:6px;font-size:14px;max-width:100%}input,select{min-height:44px;padding:8px 12px;border:1px solid #cbd7d1;border-radius:8px;max-width:100%;background:white}article{border:1px solid #dce5df;border-radius:12px;padding:20px;background:white;min-width:0;overflow-wrap:anywhere}h2{font-size:18px;font-weight:600;margin-bottom:12px}p{margin:8px 0}.note{white-space:pre-wrap}.error{color:#b42318}.hint{font-size:12px;color:#526b60}@media(max-width:600px){.approvals{padding:12px}article{padding:14px}.filters label{width:100%}}`]
})
export class CcoAuditActionApprovalsComponent implements OnInit,OnDestroy {
  rows:any[]=[];status='PENDING_CCO';search='';loading=false;busy=false;error='';message='';
  private readonly destroy$=new Subject<void>();
  constructor(private api:AuditsService,private dialog:ConfirmDialogService,private cdr:ChangeDetectorRef){}
  ngOnInit(){this.load();}
  get visibleRows(){const query=this.search.trim().toLowerCase();return this.rows.filter(r=>(!this.status || r.status===this.status) && (!query || JSON.stringify([r.audit_snapshot,r.reason,r.requestedByName]).toLowerCase().includes(query)));}
  load(){this.loading=true;this.error='';this.api.ccoAuditActionRequests().pipe(takeUntil(this.destroy$),finalize(()=>{this.loading=false;this.cdr.markForCheck();})).subscribe({next:rows=>this.rows=rows||[],error:e=>this.error=e?.error?.message||'Unable to load audit action requests'});}
  async review(row:any,decision:'APPROVE'|'REJECT'){
    if(this.busy || row.status!=='PENDING_CCO')return;
    const prompt=await this.dialog.prompt(decision==='APPROVE'?'Approve audit action':'Reject audit action',`${row.audit_snapshot.clientName} / ${row.audit_snapshot.branchName} / ${row.audit_snapshot.audit_code || row.audit_id}. ${decision==='APPROVE'?(row.action==='DELETE'?'This permanently deletes the unused schedule if it remains eligible.':'This cancels the audit and preserves its evidence and history.'):'The audit will remain unchanged.'} Enter your review note.`,{confirmText:decision==='APPROVE'?'Approve action':'Reject request',cancelText:'Back',placeholder:'Review note (5–2000 characters)'});
    if(!prompt.confirmed)return;const note=prompt.value?.trim()||'';
    if(note.length<5 || note.length>2000){this.error='Enter a review note between 5 and 2000 characters';return;}
    this.busy=true;this.error='';this.message='';
    this.api.ccoReviewAuditAction(row.id,decision,note).pipe(takeUntil(this.destroy$),finalize(()=>{this.busy=false;this.cdr.markForCheck();})).subscribe({next:()=>{this.message=decision==='APPROVE'?'Approved action completed.':'Request rejected; audit unchanged.';this.load();},error:e=>this.error=e?.error?.message||'Unable to review request'});
  }
  ngOnDestroy(){this.destroy$.next();this.destroy$.complete();}
}
