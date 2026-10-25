import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { page } from '@vitest/browser/context';
import { BranchSidebarComponent } from './branch-sidebar.component';
import { branchCompliancePurpose } from './branch-compliance-purpose';
import { AuthService } from '../../../core/auth.service';
import { BranchComplianceDocService } from '../../../core/branch-compliance-doc.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ClientPayrollSettingsService } from '../../../core/client-payroll-settings.service';

@Component({ standalone: true, template: '' })
class Destination {}

describe('Branch compliance navigation', () => {
  it.each([390, 1024, 1280])('selects one page and preserves full labels at %s pixels', async width => {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({ imports: [BranchSidebarComponent], providers: [
      provideRouter([{path:'**',component:Destination}]),
      {provide:AuthService,useValue:{getServicePackage:()=>null,hasModule:()=>true,getBranchIds:()=>[]}},
      {provide:BranchComplianceDocService,useValue:{}},
      {provide:ClientBranchesService,useValue:{}},
      {provide:ClientPayrollSettingsService,useValue:{get:()=>of({allowBranchPayrollAccess:true})}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(BranchSidebarComponent);
    const router=TestBed.inject(Router);
    fixture.componentInstance.mobileOpen=width<1024;
    fixture.detectChanges();
    for(const collapsed of [false,true]) {
      fixture.componentInstance.collapsed=collapsed;
      for(const route of ['/branch/audits','/branch/audits/observations','/branch/audits/test-audit/non-compliances','/branch/audits/evidence?auditId=test','/branch/attendance/daily']) {
        await router.navigateByUrl(route); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
        const selected=fixture.nativeElement.querySelectorAll('a[aria-current="page"]');
        expect(selected.length).toBe(1);
        expect(selected[0].getAttribute('href')).toBe((route.includes('/observations')||route.includes('/non-compliances'))?'/branch/audits/observations':route.includes('/attendance')?'/branch/attendance/daily':'/branch/audits');
        expect(fixture.nativeElement.querySelectorAll(collapsed?'a.collapsed-active':'a.sidebar-active').length).toBe(1);
      }
    }
    fixture.componentInstance.collapsed=false;
    await router.navigateByUrl('/branch/audits/observations'); fixture.detectChanges();
    const reports=fixture.nativeElement.querySelector('a[href="/branch/audits"] .sidebar-label');
    expect(getComputedStyle(reports).whiteSpace).toBe('normal');
    expect(reports.scrollWidth).toBeLessThanOrEqual(reports.clientWidth+1);
    const compliance=fixture.componentInstance.navItems.find(item=>item.label==='Compliance');
    for(const item of compliance!.children!) {
      const guide=branchCompliancePurpose('/app'+item.route);
      expect(guide?.purpose.length).toBeGreaterThan(60);
    }
    expect(branchCompliancePurpose('/app/branch/audits/observations?status=OPEN')?.title).toContain('Corrective actions');
    expect(branchCompliancePurpose('/app/branch/audits/evidence')?.title).toContain('published reports');
    expect(branchCompliancePurpose('/app/branch/employees')).toBeUndefined();
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
