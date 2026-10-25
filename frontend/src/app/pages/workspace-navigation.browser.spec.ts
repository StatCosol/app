import { of, Subject, BehaviorSubject } from 'rxjs';
import { CrmComplianceComponent } from './crm/compliance/crm-compliance.component';
import { ClientReturnsComponent } from './client/compliance/client-returns.component';
import { ClientReturnsPageComponent } from './client/returns-status/client-returns-page.component';
import { ClientComplianceService } from '../core/client-compliance.service';
import { ReturnsService } from '../core/returns.service';
import { moduleAccessGuard } from '../core/module-access.guard';
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, convertToParamMap } from '@angular/router';
import { page } from 'vitest/browser';
import { WorkspaceNavigationComponent } from '../shared/navigation/workspace-navigation.component';
import { AuthService } from '../core/auth.service';
@Component({standalone:true,template:''}) class Destination {}
afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-navigation-test]').forEach(el => el.remove()); });
async function setup(url:string, modules:string[]) {
 await TestBed.configureTestingModule({imports:[WorkspaceNavigationComponent],providers:[provideRouter([{path:'**',component:Destination}]),{provide:AuthService,useValue:{hasModule:(m:string)=>modules.includes(m)}}]}).compileComponents();
 const router=TestBed.inject(Router);await router.navigateByUrl(url);
 const fixture=TestBed.createComponent(WorkspaceNavigationComponent);
 const host=document.createElement('main');host.setAttribute('data-navigation-test','');host.style.padding='16px';document.body.append(host);host.append(fixture.nativeElement);
 fixture.detectChanges();await fixture.whenStable();return {fixture,host,router};
}
it('keeps branch and period when moving from filings to status', async()=>{
 const {fixture,host,router}=await setup('/client/compliance/returns?branchId=branch-a&periodMonth=9&periodYear=2026',['EMPLOYEE_COMPLIANCE']);
 const links=[...host.querySelectorAll('a')];expect(links).toHaveLength(3);
 expect(links[1].getAttribute('href')).toContain('branchId=branch-a');
 links[1].click();await fixture.whenStable();fixture.detectChanges();
 expect(router.url).toContain('/client/returns-status?');expect(router.url).toContain('periodMonth=9');
 expect(host.querySelector('[aria-current=page]')?.textContent).toContain('Status');
});
it('shows only permitted document categories',async()=>{
 const {host}=await setup('/branch/safety',['EMPLOYEE_COMPLIANCE']);
 expect(host.querySelectorAll('a')).toHaveLength(5);expect(host.textContent).not.toContain('Audit Evidence');
});
it('does not present other document categories to an audit-only account',async()=>{
 const {host}=await setup('/client/audits',['CONTRACTOR_AUDIT']);expect(host.querySelector('nav')).toBeNull();
});
it.each([390,768,1280])('keeps document navigation readable without horizontal overflow at %s px', async width=>{
 await page.viewport(width,900);
 const {host}=await setup('/branch/safety',['EMPLOYEE_COMPLIANCE','CONTRACTOR_AUDIT']);
 expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth+1);
 for(const link of host.querySelectorAll('a')) {expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth+1);expect(link.getBoundingClientRect().height).toBeGreaterThan(40);}
 expect(host.querySelectorAll('[aria-current=page]')).toHaveLength(1);
});

it('retains branch, period and filing identity when opening a status record',async()=>{
 const getReturns=vi.fn().mockReturnValue(of([
  {id:'filing-september',branch_id:'branch-a',return_type:'GRATUITY_FORM_LM',period_month:9,period_year:2026,status:'SUBMITTED'},
  {id:'filing-october',branch_id:'branch-a',return_type:'PF',period_month:10,period_year:2026,status:'SUBMITTED'},
 ]));
 await TestBed.configureTestingModule({imports:[ClientReturnsPageComponent],providers:[provideRouter([{path:'**',component:Destination}]),
  {provide:AuthService,useValue:{getUser:()=>({clientId:'client-a'})}},
  {provide:ReturnsService,useValue:{getClientReturns:getReturns}},
  {provide:ClientComplianceService,useValue:{getBranches:()=>of([])}}]}).compileComponents();
 const router=TestBed.inject(Router);await router.navigateByUrl('/client/returns-status?branchId=branch-a&periodMonth=9&periodYear=2026');
 const fixture=TestBed.createComponent(ClientReturnsPageComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
 expect(getReturns).toHaveBeenCalledWith('client-a','branch-a');
 expect(fixture.componentInstance.filtered.map(r=>r.id)).toEqual(['filing-september']);
 const link=fixture.nativeElement.querySelector('tbody a') as HTMLAnchorElement;
 expect(link.getAttribute('href')).not.toContain('code=');expect(link.getAttribute('href')).toContain('filingId=filing-september');expect(link.getAttribute('href')).toContain('periodYear=2026');
});
it('preserves audit bookmark parameters and checks the destination permission',async()=>{
 let permitted=true;
 await TestBed.configureTestingModule({providers:[provideRouter([
  {path:'branch/audits/evidence',redirectTo:'branch/audits',pathMatch:'full'},
  {path:'branch/audits',component:Destination,canActivate:[moduleAccessGuard('CONTRACTOR_AUDIT')]},
  {path:'client/dashboard',component:Destination},
 ]),{provide:AuthService,useValue:{hasModule:()=>permitted,getClientModuleHomePath:()=>'/client/dashboard'}}]}).compileComponents();
 const router=TestBed.inject(Router);
 await router.navigateByUrl('/branch/audits/evidence?auditId=test-a#evidence');
 expect(router.url).toBe('/branch/audits?auditId=test-a#evidence');
 await router.navigateByUrl('/client/dashboard');permitted=false;
 await router.navigateByUrl('/branch/audits/evidence?auditId=test-a');expect(router.url).toBe('/client/dashboard');
});

it('clears the hidden return-type restriction when leaving exact filing focus',()=>{
 const editor=Object.create(ClientReturnsComponent.prototype) as any;
 editor.focusedFilingId='filing-a';editor.focusCode='PF';editor.filters={returnType:'PF'};editor.loadFilings=vi.fn();
 editor.clearFilingFocus();expect(editor.focusedFilingId).toBe('');expect(editor.filters.returnType).toBe('');expect(editor.focusCode).toBe('');expect(editor.loadFilings).toHaveBeenCalledOnce();
});
it.each([[{id:'doc-a'}],{data:[{id:'doc-a'}]},{items:[{id:'doc-a'}]}])('pins client expiry requests and accepts legacy response forms %#',res=>{
 const component=Object.create(CrmComplianceComponent.prototype) as any;
 component.routeClientId='client-a';component.expiryDays=30;component.destroy$=new Subject();component.cdr={detectChanges:vi.fn()};component.toast={error:vi.fn()};
 component.crmDocsApi={list:vi.fn().mockReturnValue(of(res)),kpis:vi.fn()};
 component.loadExpiry();expect(component.crmDocsApi.list).toHaveBeenCalledWith({expiringInDays:30,clientId:'client-a'});expect(component.expiryDocs).toEqual([{id:'doc-a'}]);
 component.loadDocKpis();expect(component.crmDocsApi.kpis).not.toHaveBeenCalled();
});
it('ignores an older filing response after the user changes branch',async()=>{
 const a=new Subject<any[]>(),b=new Subject<any[]>();
 const getReturns=vi.fn().mockImplementation((_client:string,branch:string)=>branch==='branch-a'?a:b);
 await TestBed.configureTestingModule({imports:[ClientReturnsPageComponent],providers:[provideRouter([{path:'**',component:Destination}]),
  {provide:AuthService,useValue:{getUser:()=>({clientId:'client-a'})}},
  {provide:ReturnsService,useValue:{getClientReturns:getReturns}},
  {provide:ClientComplianceService,useValue:{getBranches:()=>of([])}}]}).compileComponents();
 const router=TestBed.inject(Router);await router.navigateByUrl('/client/returns-status?branchId=branch-a');
 const fixture=TestBed.createComponent(ClientReturnsPageComponent);fixture.detectChanges();await fixture.whenStable();
 await router.navigateByUrl('/client/returns-status?branchId=branch-b');await fixture.whenStable();
 b.next([{id:'new',branch_id:'branch-b'}]);a.next([{id:'stale',branch_id:'branch-a'}]);
 expect(fixture.componentInstance.branchId).toBe('branch-b');expect(fixture.componentInstance.rows.map(r=>r.id)).toEqual(['new']);
 b.error(new Error('network'));expect(fixture.componentInstance.rows).toEqual([]);expect(fixture.componentInstance.errorMessage).toContain('Unable to load');
});

it.each(['GRATUITY_FORM_LM','CLRA_FORM_XXV'])('opens an exact %s filing even from an older bookmark containing code',code=>{
 const params=convertToParamMap({filingId:'exact-id',branchId:'branch-a',periodMonth:'9',periodYear:'2026',code});
 const listFilings=vi.fn().mockReturnValue(of([{id:'exact-id',returnType:code}]));
 const component=new ClientReturnsComponent(
  {listFilings,listTypes:()=>of([])} as any,{getBranches:()=>of([])} as any,
  {isMasterUser:()=>true,getUser:()=>null,getBranchIds:()=>[]} as any,{error:vi.fn()} as any,
  {snapshot:{queryParamMap:params},queryParamMap:new BehaviorSubject(params)} as any,
  {navigate:vi.fn().mockResolvedValue(true)} as any,{detectChanges:vi.fn()} as any,{setContext:vi.fn()} as any);
 component.ngOnInit();
 expect(component.filters.returnType).toBe('');expect(component.visibleFilings.map(f=>f.id)).toEqual(['exact-id']);
 expect(listFilings.mock.calls.every(call=>call[0].branchId==='branch-a')).toBe(true);component.ngOnDestroy();
});

import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BranchLayoutComponent } from './branch/branch-layout/branch-layout.component';
import { BranchSidebarComponent } from './branch/branch-layout/branch-sidebar.component';
import { NewsTickerComponent } from '../shared/news/news-ticker.component';
import { WorkspaceToolsComponent } from '../shared/components/workspace-tools/workspace-tools.component';

it.each([['EMPLOYEE_COMPLIANCE'], ['EMPLOYEE_COMPLIANCE','CONTRACTOR_AUDIT']])('renders document navigation in the actual branch layout with permitted modules %j', async (...modules: string[]) => {
 await TestBed.configureTestingModule({imports:[BranchLayoutComponent],providers:[
  provideRouter([{path:'**',component:Destination}]),
  {provide:AuthService,useValue:{getUser:()=>({name:'Test branch'}),fetchMe:()=>of({}),hasModule:(m:string)=>modules.includes(m)}}
 ]}).overrideComponent(BranchLayoutComponent, {
  remove:{imports:[BranchSidebarComponent,NewsTickerComponent,WorkspaceToolsComponent]},
  add:{schemas:[NO_ERRORS_SCHEMA]}
 }).compileComponents();
 const router=TestBed.inject(Router); await router.navigateByUrl('/branch/unit-documents?branchId=branch-a');
 const fixture=TestBed.createComponent(BranchLayoutComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
 const nav=fixture.nativeElement.querySelector('app-workspace-navigation nav');
 expect(nav).not.toBeNull();
 expect(nav.querySelectorAll('a').length).toBe(modules.includes('CONTRACTOR_AUDIT') ? 6 : 5);
 expect(nav.querySelector('[aria-current=page]').textContent).toContain('Unit Certificates');
 const library=[...nav.querySelectorAll('a')].find((a:any)=>a.textContent.includes('Submission Library')) as HTMLAnchorElement;
 library.click(); await fixture.whenStable(); fixture.detectChanges();
 expect(router.url).toBe('/branch/compliance-library?branchId=branch-a');
 expect(nav.textContent.includes('Audit Evidence')).toBe(modules.includes('CONTRACTOR_AUDIT'));
});