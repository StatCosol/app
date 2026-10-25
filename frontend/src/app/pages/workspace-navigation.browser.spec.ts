import { of } from 'rxjs';
import { ClientReturnsPageComponent } from './client/returns-status/client-returns-page.component';
import { ClientComplianceService } from '../core/client-compliance.service';
import { ReturnsService } from '../core/returns.service';
import { moduleAccessGuard } from '../core/module-access.guard';
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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
  {id:'filing-september',branch_id:'branch-a',return_type:'PF',period_month:9,period_year:2026,status:'SUBMITTED'},
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
 expect(link.getAttribute('href')).toContain('filingId=filing-september');expect(link.getAttribute('href')).toContain('periodYear=2026');
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
