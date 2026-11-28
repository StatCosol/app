import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
import { RouterTestingModule } from '@angular/router/testing';
import { AuditorDashboardComponent } from './auditor-dashboard.component';
import { DashboardService } from '../../core/dashboard.service';
import { Subject } from 'rxjs';
import { page } from 'vitest/browser';

describe('AuditorDashboardComponent', () => {
  let component: AuditorDashboardComponent;
  let fixture: ComponentFixture<AuditorDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditorDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditorDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBe(true);
  });

  it('should have default summary values', () => {
    expect(component.summary.assignedAuditsCount).toBe(0);
    expect(component.summary.overdueAuditsCount).toBe(0);
    expect(component.summary.reportsPendingCount).toBe(0);
  });

  it('should have table column definitions', () => {
    expect(component.auditColumns.length).toBeGreaterThan(0);
    expect(component.observationColumns.length).toBeGreaterThan(0);
    expect(component.evidenceColumns.length).toBeGreaterThan(0);
  });

  it('should default to ACTIVE audit tab', () => {
    expect(component.auditTab).toBe('ACTIVE');
  });
  it('offers Start Audit for planned assignments', () => {
    expect(component.getAuditActionLabel({ status: 'PLANNED' } as any)).toBe('Start Audit');
  });

  it('routes follow-up and closure to scoped verification without changing records', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const update = vi.spyOn(TestBed.inject(AuditorObservationsService), 'update');
    const observation = { auditId: 'audit-a', observationId: 'observation-a' } as any;
    component.followUpObservation(observation);
    component.closeObservation(observation);
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith(['/auditor/observations'], {
      queryParams: { auditId: 'audit-a', observationId: 'observation-a' },
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('Dashboard assigned-client selector',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  async function setup(){
    await TestBed.configureTestingModule({imports:[AuditorDashboardComponent,HttpClientTestingModule,RouterTestingModule]}).compileComponents();
    const fixture=TestBed.createComponent(AuditorDashboardComponent), component=fixture.componentInstance;
    vi.spyOn(component,'loadAllData').mockImplementation(()=>{});
    vi.spyOn(component,'loadReferenceData').mockImplementation(()=>{});
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    const requests:Subject<any>[]=[];
    vi.spyOn(TestBed.inject(DashboardService),'getAuditorAudits').mockImplementation(()=>{const req=new Subject<any>();requests.push(req);return req;});
    component.loading=false;
    const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await Promise.resolve();fixture.detectChanges();};
    await render();return{fixture,component,navigate,requests,render};
  }
  const rows=Array.from({length:35},(_,i)=>({auditId:'audit-'+i,auditCode:'AUD-'+i,clientId:'client-one',clientName:'Client One',branchId:'branch-'+(i%3),branchName:'Branch '+(i%3),auditType:'CONTRACTOR',dueDate:'2026-11-30',status:'PLANNED'}));
  it.each([390,768,1440])('groups 35 assignments into one client choice and opens its branches at %ipx',async width=>{
    await page.viewport(width,900);const t=await setup();t.component.loadActionableAudits();t.requests[0].next({items:rows});t.requests[0].complete();await t.render();
    expect(t.component.quickClientOptions).toEqual([{value:'',label:'Choose an assigned client'},{value:'client-one',label:'Client One · 35 active audits'}]);
    const root=t.fixture.nativeElement as HTMLElement;
    const select=Array.from(root.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.text==='Client One · 35 active audits'))!;
    expect(select.options).toHaveLength(2);
    select.value=select.options[1].value;select.dispatchEvent(new Event('change'));await t.render();
    Array.from(root.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Open client branches')!.click();await t.render();
    expect(t.navigate).toHaveBeenLastCalledWith(['/auditor/audits'],{queryParams:{clientId:'client-one'}});
    expect(root.textContent).not.toContain('Select an audit to start');
    expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await page.screenshot({path:'../../../../../docs/reviews/2026-11-28/dashboard-assigned-client-'+width+'.png'});
  });
  it('ignores a stale client list and prevents navigation after a failed reload',async()=>{
    const t=await setup();t.component.loadActionableAudits();t.component.loadActionableAudits();
    t.requests[1].next({items:rows});t.requests[1].complete();t.requests[0].next({items:[{...rows[0],clientId:'stale'}]});t.requests[0].complete();
    expect(t.component.quickClientOptions.map(o=>o.value)).toEqual(['','client-one']);
    t.component.selectedQuickClientId='client-one';t.component.loadActionableAudits();t.component.openAssignedClient();expect(t.navigate).not.toHaveBeenCalled();
    t.requests[2].error(new Error('load failed'));await t.render();t.component.openAssignedClient();
    expect(t.component.quickClientsError).toBe(true);expect(t.component.selectedQuickClientId).toBe('');expect(t.navigate).not.toHaveBeenCalled();
  });
});
