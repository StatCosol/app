import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { page } from 'vitest/browser';
import { ClientSidebarComponent } from '../pages/client/client-layout/client-sidebar.component';
import { BranchSidebarComponent } from '../pages/branch/branch-layout/branch-sidebar.component';
import { CrmSidebarComponent } from '../pages/crm/crm-layout/crm-sidebar.component';
import { AuditorSidebarComponent } from '../pages/auditor/auditor-layout/auditor-sidebar.component';
import { ContractorSidebarComponent } from '../pages/contractor/contractor-layout/contractor-sidebar.component';
import { PayrollSidebarComponent } from '../pages/payroll/payroll-layout/payroll-sidebar.component';
import { CcoSidebarComponent } from '../pages/cco/cco-layout/cco-sidebar.component';
import { AuthService } from '../core/auth.service';
import { ClientPayrollSettingsService } from '../core/client-payroll-settings.service';
import { BranchComplianceDocService } from '../core/branch-compliance-doc.service';
import { ClientBranchesService } from '../core/client-branches.service';
import { ClientLayoutComponent } from '../pages/client/client-layout/client-layout.component';
import { NewsService } from './services/news.service';

const portals = [
  ['client', ClientSidebarComponent], ['branch', BranchSidebarComponent],
  ['crm', CrmSidebarComponent], ['auditor', AuditorSidebarComponent],
  ['contractor', ContractorSidebarComponent], ['payroll', PayrollSidebarComponent],
  ['cco', CcoSidebarComponent],
] as const;
const auth = { getServicePackage: () => null, hasModule: () => true, hasAnyModule: () => true,
  getBranchIds: () => [], isBranchUser: () => false, isMasterUser: () => true, getUser: () => ({ roleCode: 'CLIENT' }) };

describe.each(portals)('%s responsive navigation', (role, Component) => {
  afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-responsive-test]').forEach(el => el.remove()); });
  async function setup(width: number) {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({ imports: [Component], providers: [
      provideRouter([]), { provide: AuthService, useValue: auth },
      { provide: ClientPayrollSettingsService, useValue: { get: () => of({ allowBranchPayrollAccess: true }) } },
      { provide: BranchComplianceDocService, useValue: {} }, { provide: ClientBranchesService, useValue: {} },
    ] }).compileComponents();
    const host = document.createElement(`app-${role}-layout`);
    host.className = 'workspace-ui'; host.setAttribute('data-responsive-test', '');
    const opener = document.createElement('button'); opener.textContent = 'Open navigation';
    host.append(opener); document.body.append(host); opener.focus();
    const fixture = TestBed.createComponent<any>(Component); host.append(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable();
    return { fixture, opener, panel: fixture.nativeElement.querySelector('aside') as HTMLElement };
  }
  it.each([390, 768])('hides closed navigation and traps/restores focus at %s px', async width => {
    const { fixture, opener, panel } = await setup(width);
    expect(panel.inert).toBe(true);
    expect(getComputedStyle(panel).visibility).toBe('hidden');
    fixture.componentRef.setInput('mobileOpen', true); fixture.detectChanges(); await fixture.whenStable();
    expect(panel.inert).toBe(false); expect(panel.getAttribute('role')).toBe('dialog');
    const close = panel.querySelector('[aria-label="Close navigation"]') as HTMLButtonElement;
    expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await vi.waitFor(() => expect(document.activeElement).toBe(close));
    expect(getComputedStyle(panel.querySelector('.sidebar-toggle')!).display).toBe('none');
    expect(panel.getBoundingClientRect().width).toBeLessThanOrEqual(width - 48);
    const buttons = [...panel.querySelectorAll<HTMLElement>('button,a[href],input')]
      .filter(el => el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = buttons[0], last = buttons.at(-1)!;
    last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab',bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(last);
    const emitted = vi.fn(); fixture.componentInstance.mobileOpenChange.subscribe(emitted);
    last.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true}));
    fixture.detectChanges(); await fixture.whenStable();
    expect(emitted).toHaveBeenCalledWith(false); expect(panel.inert).toBe(true);
    expect(document.activeElement).toBe(opener);
  });
  it('keeps desktop navigation accessible and responds to a tablet resize', async () => {
    const { fixture, panel } = await setup(1280);
    expect(panel.inert).toBe(false); expect(panel.getAttribute('role')).toBe('navigation');
    expect(getComputedStyle(panel.querySelector('.sidebar-toggle')!).display).not.toBe('none');
    await page.viewport(768, 900);
    await vi.waitFor(() => expect(panel.inert).toBe(true));
    fixture.componentRef.setInput('mobileOpen', true); fixture.detectChanges(); await fixture.whenStable();
    await page.viewport(1280, 900);
    await vi.waitFor(() => expect(panel.getAttribute('role')).toBe('navigation'));
    expect(panel.inert).toBe(false); expect(panel.hasAttribute('aria-modal')).toBe(false);
  });
  it('uses expandable buttons instead of pointer-only group headings', async () => {
    const { fixture, panel } = await setup(768);
    fixture.componentRef.setInput('mobileOpen', true); fixture.detectChanges(); await fixture.whenStable();
    const group = panel.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(group).toBeTruthy();
    const before = group.getAttribute('aria-expanded');
    group.click(); fixture.detectChanges();
    expect(group.getAttribute('aria-expanded')).not.toBe(before);
  });
});

describe('Client header responsive spacing', () => {
  afterEach(() => {TestBed.resetTestingModule();document.querySelectorAll('[data-responsive-header]').forEach(el=>el.remove());});
  it.each([320, 390, 768, 1024])('keeps branding and actions readable at %s px', async width => {
    await page.viewport(width, 900);
    const user = { name: 'TEST User', clientLogoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="40"%3E%3Ctext x="5" y="25"%3ETEST%3C/text%3E%3C/svg%3E' };
    await TestBed.configureTestingModule({imports:[ClientLayoutComponent], providers:[
      provideRouter([]),
      {provide:AuthService,useValue:{...auth,getUser:()=>user,authenticateUrl:(s:string)=>s,fetchMe:()=>of(user)}},
      {provide:ClientPayrollSettingsService,useValue:{get:()=>of({allowBranchPayrollAccess:true})}},
      {provide:NewsService,useValue:{getActiveNews:()=>of([])}},
    ]}).compileComponents();
    const host=document.createElement('app-client-layout');host.setAttribute('data-responsive-header','');document.body.append(host);
    const fixture=TestBed.createComponent(ClientLayoutComponent);host.append(fixture.nativeElement);
    fixture.detectChanges();await fixture.whenStable();
    await Promise.all([...fixture.nativeElement.querySelectorAll('header img')].map((img:any)=>img.decode().catch(()=>{})));
    const header=fixture.nativeElement.querySelector('header') as HTMLElement;
    const brand=header.querySelector('app-statco-wordmark')!.getBoundingClientRect();
    expect(brand.width).toBeGreaterThanOrEqual(125);
    for(const button of header.querySelectorAll('button')){
      const r=button.getBoundingClientRect();if(!r.width)continue;
      expect(r.right).toBeLessThanOrEqual(width+1);expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.height).toBeGreaterThanOrEqual(width<1024?44:30);
    }
    if(width<1024){
      const toggle=header.querySelector('.portal-nav-toggle') as HTMLElement;
      expect(toggle.getBoundingClientRect().width).toBe(44);
      expect(toggle.querySelector('svg')!.getBoundingClientRect().width).toBe(24);
      expect(toggle.getBoundingClientRect().right).toBeLessThanOrEqual(brand.left);
    }
    fixture.destroy();
  });
});
