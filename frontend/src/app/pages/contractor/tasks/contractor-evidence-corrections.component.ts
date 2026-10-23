import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { ContractorProfileApiService } from '../../../core/contractor-profile-api.service';

@Component({
 selector:'app-contractor-evidence-corrections',standalone:true,imports:[CommonModule,FormsModule],changeDetection:ChangeDetectionStrategy.OnPush,
 template:`<section class="rounded-xl border border-slate-200 bg-white p-5 my-5" aria-label="Bank proof and bill corrections">
 <h3 class="text-lg font-semibold">Bank proof and bill corrections</h3>
 <p class="text-sm text-slate-600 mb-3">Read CRM's rejection reason, select that file and upload its correction. Each resubmission needs a fresh CRM review. This does not approve or make a payment.</p>
 <label class="block text-sm mb-3">Records<select aria-label="Evidence records" [disabled]="busy" [(ngModel)]="recordScope" (ngModelChange)="selected=null" class="border rounded p-2 ml-2"><option value="ACTUAL">Actual records</option><option value="TEST">Test records only</option></select></label>
 @if(recordScope==='TEST'){<p role="status" class="text-amber-800">TEST DATA ONLY - not actual payment evidence.</p>}
 <label class="block text-sm">Find bank proof or bill<input class="block border rounded p-2 w-full my-2" name="evidenceSearch" [(ngModel)]="search" /></label>
 <button type="button" class="border rounded px-3 py-1 mb-3" (click)="load()" [disabled]="busy || loading">Refresh evidence</button>
 @if(error){<p role="alert" class="text-red-700">{{error}}</p>}
 @if(message){<p role="status" class="text-green-800">{{message}}</p>}
 @if(loading){<p role="status">Loading evidence…</p>}
 @else if(!error) {<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left p-2">File</th><th class="text-left p-2">Status</th><th class="text-left p-2">CRM review notes</th><th class="p-2">Action</th></tr></thead><tbody>
 @for(doc of filtered;track doc.id){<tr class="border-t"><td class="p-2">{{doc.fileName}}<div class="text-xs text-slate-500">{{doc.docType}}</div></td><td class="p-2">{{doc.status}}</td><td class="p-2">{{doc.reviewNotes || 'Awaiting CRM review'}}</td><td class="p-2">@if(doc.status==='REJECTED'){<button type="button" class="border rounded p-2" (click)="select(doc)" [disabled]="busy">Correct and resubmit</button>} @else {<span>Review required before further changes</span>}</td></tr>}
 </tbody></table></div>
 @if(!filtered.length){<p>No bank proofs or bills match this month, branch and search.</p>}}
 @if(selected){<div class="border rounded p-4 mt-4" role="region" aria-label="Correct rejected evidence">
 <h4 class="font-semibold">Correct: {{selected.fileName}}</h4><p class="text-sm">CRM reason: {{selected.reviewNotes}}</p>
 <label class="block mt-2">Correction summary<textarea class="block border rounded p-2 w-full" name="correctionSummary" [(ngModel)]="notes" maxlength="2000" [disabled]="busy"></textarea></label>
 <label class="block mt-2">Corrected file<input class="block my-2" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx" (change)="chooseFile($event)" [disabled]="busy" /></label>
 <button type="button" class="rounded bg-emerald-800 text-white p-2 mr-2" (click)="submit()" [disabled]="!canSubmit">{{busy?'Resubmitting…':'Resubmit for CRM review'}}</button>
 <button type="button" class="border rounded p-2" (click)="selected=null" [disabled]="busy">Cancel correction</button>
 </div>}
 </section>`
})
export class ContractorEvidenceCorrectionsComponent implements OnChanges,OnDestroy {
 @Input() month='';@Input() branchId='';@Output() corrected=new EventEmitter<void>();
 recordScope: 'ACTUAL' | 'TEST' = 'ACTUAL';
 docs:any[]=[];selected:any=null;file:File|null=null;notes='';search='';busy=false;loading=false;error='';message='';private read?:Subscription;private write?:Subscription;
 constructor(private api:ContractorProfileApiService,private cdr:ChangeDetectorRef){}
 showType(type:string){this.search=type;this.selected=null;this.cdr.markForCheck();}
 ngOnChanges(){this.selected=null;this.file=null;this.notes='';this.message='';this.load();}
 ngOnDestroy(){this.read?.unsubscribe();this.write?.unsubscribe();}
 get filtered(){const q=this.search.trim().toLowerCase();return this.docs.filter(d=>(/^TEST([ _-]|$)/i.test(d.fileName||'') === (this.recordScope==='TEST'))).filter(d=>!q || `${d.fileName} ${d.docType} ${d.reviewNotes||''}`.toLowerCase().includes(q));}
 get canSubmit(){return !!this.selected && !!this.file && this.notes.trim().length>=10 && this.notes.trim().length<=2000 && !this.busy;}
 load(){this.read?.unsubscribe();this.loading=true;this.error='';this.read=this.api.getContractorDocuments({month:this.month,...(this.branchId?{branchId:this.branchId}:{})}).pipe(finalize(()=>{this.loading=false;this.cdr.markForCheck();})).subscribe({next:rows=>{this.docs=(Array.isArray(rows)?rows:rows?.data||[]).filter((d:any)=>/BANK|PAYMENT_PROOF|CONTRACTOR_BILL|INVOICE|CREDIT_NOTE|DEBIT_NOTE/i.test(String(d.docType).replace(/[^a-z0-9]+/gi,'_')));this.cdr.markForCheck();},error:e=>{this.docs=[];this.error=e?.error?.message||'Could not load financial evidence. Refresh and try again.';this.cdr.markForCheck();}});}
 select(doc:any){if(this.busy || doc.status!=='REJECTED')return;this.selected=doc;this.file=null;this.notes='';this.error='';this.message='';}
 chooseFile(event:Event){this.file=(event.target as HTMLInputElement).files?.[0]||null;}
 submit(){if(!this.canSubmit)return;const doc=this.selected;this.busy=true;this.error='';this.write=this.api.resubmitEvidence(doc,this.file!,this.notes.trim()).pipe(finalize(()=>{this.busy=false;this.cdr.markForCheck();})).subscribe({next:()=>{this.selected=null;this.file=null;this.notes='';this.message='Corrected file resubmitted. Awaiting fresh CRM review.';this.load();this.corrected.emit();},error:e=>{this.error=e?.error?.message||'Could not resubmit. Refresh before trying again.';if(e?.status===409){this.selected=null;this.file=null;this.load();this.error=e?.error?.message||'Evidence changed. Select the current rejected file.';}this.cdr.markForCheck();}});}
}
