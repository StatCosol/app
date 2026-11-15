import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { EscalationsComponent } from '../shared/escalations/escalations.component';
import { ClientBranchesService } from '../core/client-branches.service';
import { AuthService } from '../core/auth.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';
import { AdminApiService } from '../core/admin-api.service';

afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-escalation-test]').forEach(n=>n.remove()); });
const branches=[{id:'TEST-B1',name:'Synthetic branch 1'},{id:'TEST-B2',name:'Synthetic branch 2'}];
const row={id:'TEST-A',clientId:'TEST-C1',branchId:'TEST-B1',branchName:'Synthetic branch',reason:'Synthetic long reason '.repeat(14),status:'OPEN',riskScore:80,slaOverdueCount:2,createdAt:'2026-11-01'};
for(const width of [390,768,1440]) for(const role of ['Client','Branch','CRM']) {
  it(`${role} escalation filters, status safety and recovery at ${width}px`, async()=>{
    await page.viewport(width,900);
    const reads:Subject<any>[]=[],writes:Subject<any>[]=[];
    const request=(list:Subject<any>[])=>{const s=new Subject<any>();list.push(s);return s;};
    const getEscalations=vi.fn(()=>request(reads)),updateEscalation=vi.fn(()=>request(writes));
    await TestBed.configureTestingModule({imports:[EscalationsComponent],providers:[provideZonelessChangeDetection(),
      {provide:ClientBranchesService,useValue:{list:()=>of(branches),getEscalations,updateEscalation}},
      {provide:AuthService,useValue:{getRoleCode:()=>role==='CRM'?'CRM':'CLIENT',getBranchIds:()=>role==='Branch'?['TEST-B1']:[],isMasterUser:()=>role!=='Branch'}},
      {provide:CrmClientsApi,useValue:{getAssignedClients:()=>of([{id:'TEST-C1',name:'Synthetic 1'},{id:'TEST-C2',name:'Synthetic 2'}]),getBranchesForClient:()=>of(branches)}},
      {provide:AdminApiService,useValue:{}},
    ]}).compileComponents();
    const f=TestBed.createComponent(EscalationsComponent),c=f.componentInstance;
    const h=document.createElement('app-'+role.toLowerCase()+'-layout');h.className='workspace-ui';h.setAttribute('data-escalation-test','');document.body.append(h);h.append(f.nativeElement);f.detectChanges();await f.whenStable();
    const select=(label:string,value:string)=>{const el=h.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
    const old=reads[0];select('Escalation status','OPEN');await f.whenStable();
    if(role==='CRM'){select('Client','TEST-C2');await f.whenStable();expect(c.clientId).toBe('TEST-C2');}
    if(role!=='Branch'){select('Branch','TEST-B2');await f.whenStable();}
    reads.at(-1)!.next({items:[row]});old.next({items:[{...row,reason:'TEST-STALE'}]});await f.whenStable();
    expect(h.textContent).toContain(row.reason);expect(h.textContent).not.toContain('TEST-STALE');expect(h.scrollWidth).toBeLessThanOrEqual(width+1);
    const close=h.querySelector<HTMLButtonElement>('.btn-close')!,ack=h.querySelector<HTMLButtonElement>('.btn-ack')!;
    close.click();await f.whenStable();expect(close.disabled).toBe(true);expect(ack.disabled).toBe(true);ack.click();expect(writes).toHaveLength(1);
    writes[0].error(Error('Synthetic lost response'));await f.whenStable();expect(h.querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed');expect(ack.disabled).toBe(true);
    Array.from(h.querySelectorAll('button')).find(b=>b.textContent?.includes('Refresh escalations'))!.click();await f.whenStable();reads.at(-1)!.next({items:[row]});await f.whenStable();
    h.querySelector<HTMLButtonElement>('.btn-close')!.click();await f.whenStable();writes[1].next({...row,status:'CLOSED'});await f.whenStable();reads.at(-1)!.next({items:[]});await f.whenStable();expect(h.textContent).toContain('No escalations found');
    select('Escalation status','CLOSED');await f.whenStable();reads.at(-1)!.next({items:[{...row,status:'CLOSED'}]});await f.whenStable();expect(h.querySelector<HTMLButtonElement>('.btn-ack')!.disabled).toBe(true);expect(h.querySelector<HTMLButtonElement>('.btn-close')!.disabled).toBe(true);
    select('Escalation status','ACK');await f.whenStable();reads.at(-1)!.error(Error('Synthetic outage'));await f.whenStable();expect(h.textContent).toContain('Escalations could not be loaded');expect(h.textContent).not.toContain('No escalations found');expect(h.querySelector('.stats')).toBeNull();
    Array.from(h.querySelectorAll('button')).find(b=>b.textContent?.includes('Retry escalations'))!.click();await f.whenStable();reads.at(-1)!.next({items:[]});await f.whenStable();expect(h.querySelector('[role="alert"]')).toBeNull();expect(h.textContent).toContain('No escalations match the current filters.');expect(h.scrollWidth).toBeLessThanOrEqual(width+1);f.destroy();
  });
}
