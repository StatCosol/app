import { Component, Input, OnChanges, OnDestroy, ChangeDetectionStrategy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { environment } from '../../../../environments/environment';
interface ActionPlan {
 mode: 'AI' | 'RULES'; note: string; coverage: string; generatedAt: string;
 actions: Array<{id:string; title:string; status:string; branchName:string|null; dueDate:string|null; explanation:string; nextAction:string; route:string; queryParams:Record<string,string|number>}>;
}
@Component({selector:'app-compliance-assistant',standalone:true,imports:[RouterLink],changeDetection:ChangeDetectionStrategy.OnPush,
 template: `
 <section class="m-4 rounded-xl border border-indigo-200 bg-white p-5" aria-label="Compliance assistant">
  <div class="flex flex-wrap items-center justify-between gap-3">
   <div><h2 class="text-lg font-semibold text-slate-900">Compliance assistant</h2><p class="text-sm text-slate-600">Explain open gaps and suggest next steps for the selected month and branch scope.</p></div>
   <button type="button" class="rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50" [disabled]="loading()" (click)="generate()">{{ loading() ? 'Reviewing gaps…' : result() ? 'Refresh action plan' : 'Explain my gaps' }}</button>
  </div>
  @if(error()) { <p role="alert" class="mt-3 text-red-700">{{error()}} Use the button above to retry.</p> }
  @if(result(); as plan) {
   <p class="mt-3 text-sm text-slate-600" role="status">{{plan.note}}</p>
   <p class="text-xs text-slate-500">{{plan.coverage}}</p>
   @for(action of plan.actions; track action.id) {
    <article class="mt-4 rounded-lg border border-slate-200 p-4">
     <div class="flex flex-wrap justify-between gap-2"><h3 class="font-semibold">{{action.title}}</h3><span class="text-sm font-medium">{{action.status}}</span></div>
     <p class="text-xs text-slate-500">{{action.branchName || 'Selected company'}} · Task {{action.id}} @if(action.dueDate) { · Due {{action.dueDate}} }</p>
     <p class="mt-2 text-sm">{{action.explanation}}</p><p class="mt-1 text-sm"><strong>Next step:</strong> {{action.nextAction}}</p>
     <a class="mt-2 inline-block font-medium text-indigo-700 underline" [routerLink]="action.route" [queryParams]="action.queryParams">Open compliance tasks</a>
    </article>
   } @empty { <p class="mt-3 text-sm">No open tasks were returned for this period and scope. This does not confirm that every compliance obligation is complete.</p> }
  }
 </section>`})
export class ComplianceAssistantComponent implements OnChanges, OnDestroy {
 @Input() month = new Date().getMonth()+1;
 @Input() year = new Date().getFullYear();
 @Input() branchId: string | number | null = null;
 constructor(private readonly http: HttpClient) {}
 private request?: Subscription;
 readonly loading=signal(false); readonly error=signal(''); readonly result=signal<ActionPlan|null>(null);
 ngOnChanges(){this.request?.unsubscribe();this.result.set(null);this.error.set('');this.loading.set(false);}
 ngOnDestroy(){this.request?.unsubscribe();}
 generate(){
  this.request?.unsubscribe();this.loading.set(true);this.error.set('');this.result.set(null);
  const branchId = this.branchId && this.branchId !== 'ALL' ? String(this.branchId) : undefined;
  this.request=this.http.post<ActionPlan>(environment.apiBaseUrl+'/api/v1/legitx/assistant/plan',{month:this.month,year:this.year,branchId}).pipe(timeout(90000)).subscribe({
   next: plan=>{this.result.set(plan);this.loading.set(false);},
   error: ()=>{this.error.set('The action plan could not be loaded. Your records have not been changed.');this.loading.set(false);}
  });
 }
}
