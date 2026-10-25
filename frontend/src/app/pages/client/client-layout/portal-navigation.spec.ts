import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { page } from '@vitest/browser/context';
import { ClientSidebarComponent } from './client-sidebar.component';
import { CrmSidebarComponent } from '../../crm/crm-layout/crm-sidebar.component';
import { AuditorSidebarComponent } from '../../auditor/auditor-layout/auditor-sidebar.component';
import { ContractorSidebarComponent } from '../../contractor/contractor-layout/contractor-sidebar.component';
import { PayrollSidebarComponent } from '../../payroll/payroll-layout/payroll-sidebar.component';
import { CcoSidebarComponent } from '../../cco/cco-layout/cco-sidebar.component';
import { AuthService } from '../../../core/auth.service';
import { ClientPayrollSettingsService } from '../../../core/client-payroll-settings.service';
import { PortalPagePurposeComponent } from '../../../shared/navigation/portal-page-purpose.component';
import { portalPagePurpose } from '../../../shared/navigation/portal-page-purpose';

@Component({standalone:true,template:''}) class Destination {}
const portals: [string, Type<any>][] = [['client',ClientSidebarComponent],['crm',CrmSidebarComponent],['auditor',AuditorSidebarComponent],['contractor',ContractorSidebarComponent],['payroll',PayrollSidebarComponent],['cco',CcoSidebarComponent]];
describe('Portal navigation and guidance',()=>{
  for(const [role,component] of portals) {
    it.each([390,768,1280])(`${role}: one selected destination and readable guidance at %s`,async width=>{
      await page.viewport(width,900);
      await TestBed.configureTestingModule({imports:[component,PortalPagePurposeComponent],providers:[
        provideRouter([{path:'**',component:Destination}]),
        {provide:AuthService,useValue:{getServicePackage:()=>null,isMasterUser:()=>true,isBranchUser:()=>false,hasModule:()=>true}},
        {provide:ClientPayrollSettingsService,useValue:{get:()=>of({allowBranchPayrollAccess:true})}},
      ]}).compileComponents();
      const fixture=TestBed.createComponent(component);
      const router=TestBed.inject(Router);
      fixture.componentInstance.mobileOpen=width<1024;
      fixture.detectChanges();
      const items=[...fixture.componentInstance.navGroups.flatMap((g:any)=>g.items)];
      if(role==='payroll') {
        await router.navigateByUrl('/payroll/clients/test-client/overview');fixture.detectChanges();
        items.push(...fixture.componentInstance.navGroups.flatMap((g:any)=>g.items));
      }
      const seen=new Set<string>();
      for(const item of items) {
        const url=item.route+(item.queryParams?'?'+new URLSearchParams(item.queryParams).toString():'');
        if(seen.has(url)) continue; seen.add(url);
        for(const collapsed of [false,true]) {
          fixture.componentInstance.collapsed=collapsed;
          await router.navigateByUrl(url);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
          const selected=fixture.nativeElement.querySelectorAll('a[aria-current="page"]');
          expect(selected.length,`${role} ${url} collapsed=${collapsed}`).toBe(1);
          expect(fixture.nativeElement.querySelectorAll(collapsed?'a.collapsed-active':'a.sidebar-active').length).toBe(1);
          expect(portalPagePurpose('/app'+url)?.purpose.length,url).toBeGreaterThan(60);
          if(!collapsed) {
            const label=selected[0].querySelector('.sidebar-label');
            expect(getComputedStyle(label).whiteSpace).toBe('normal');
            expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth+1);
          }
        }
      }
      // Detail pages preserve the selection and the containing group.
      const detail=role==='payroll'?'/payroll/clients/test-client/employees/test-employee':role==='contractor'?'/contractor/tasks/test-task?type=AUDIT':`/${role}/${role==='client'?'employees':role==='crm'?'clients':role==='auditor'?'audits':'approvals'}/test-record`;
      await router.navigateByUrl('/app'+detail);fixture.componentInstance.collapsed=false;fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('a[aria-current="page"]').length,detail).toBe(1);
      expect(fixture.componentInstance.navGroups.filter((g:any)=>g.expanded).length).toBe(1);
      const guide=TestBed.createComponent(PortalPagePurposeComponent);guide.detectChanges();
      const aside=guide.nativeElement.querySelector('aside');
      expect(aside.textContent.length).toBeGreaterThan(60);
      expect(aside.scrollWidth).toBeLessThanOrEqual(aside.clientWidth+1);
      guide.destroy();fixture.destroy();TestBed.resetTestingModule();
    });
  }
});
