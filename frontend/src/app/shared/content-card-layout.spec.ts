import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { of } from 'rxjs';
import { ThreadInboxListComponent } from './components/thread/thread-inbox-list.component';
import { ThreadLayoutComponent } from './thread/components/thread-layout/thread-layout.component';
import { ThreadListComponent } from './thread/components/thread-list/thread-list.component';
import { ClientEmployeesComponent } from '../pages/client/employees/client-employees.component';

@Component({standalone:true,template:`<main><div class="tabs" style="max-width:240px"><button class="tab-btn">All documents (0)</button><button class="tab-btn">Monthly Compliance Docket</button><button class="tab-btn">Audit Reports</button></div></main>`,styleUrls:['../pages/client/compliance/client-compliance-library.component.scss']})
class LibraryTabsFixture {}
function hostFor(role:string){const host=document.createElement(`app-${role}-layout`);host.className='workspace-ui';host.setAttribute('data-content-layout','');document.body.append(host);return host;}
afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();document.querySelectorAll('[data-content-layout]').forEach(e=>e.remove());});

it.each([390,768,1280])('keeps document tab labels readable at %s px',async width=>{
 await page.viewport(width,900);await TestBed.configureTestingModule({imports:[LibraryTabsFixture]}).compileComponents();
 const host=hostFor('client'),f=TestBed.createComponent(LibraryTabsFixture);host.append(f.nativeElement);f.detectChanges();
 const tabs=host.querySelector('.tabs')!;expect(tabs.scrollWidth).toBeGreaterThan(tabs.clientWidth);
 for(const b of tabs.querySelectorAll('button'))expect(b.scrollWidth).toBeLessThanOrEqual(b.clientWidth+1);f.destroy();
});
it.each([390,768,1280])('stacks helpdesk cards rather than squashing their content at %s px',async width=>{
 await page.viewport(width,900);await TestBed.configureTestingModule({imports:[ThreadListComponent]}).compileComponents();
 const host=hostFor('crm'),f=TestBed.createComponent(ThreadListComponent);host.style.width='280px';host.append(f.nativeElement);
 f.componentRef.setInput('items',[{id:'TEST',type:'COMPLIANCE',status:'OPEN',subject:'TEST ONLY â€” a very long registration request subject for layout verification',fromName:'Synthetic requester',clientName:'Test company',lastMessageAt:'2026-01-01'}]);f.detectChanges();
 const card=host.querySelector('button.thread-card')!;const sections=[...card.children].map(e=>e.getBoundingClientRect());
 expect(card.getBoundingClientRect().height).toBeLessThan(150);
 for(let i=1;i<sections.length;i++)expect(sections[i].top).toBeGreaterThanOrEqual(sections[i-1].bottom-1);
 expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth+1);f.destroy();
});
it.each([390,768,1280])('wraps long employee names within the actual table cell at %s px',async width=>{
 await page.viewport(width,900);vi.spyOn(ClientEmployeesComponent.prototype,'load').mockImplementation(()=>{});
 await TestBed.configureTestingModule({imports:[ClientEmployeesComponent],providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([])]}).compileComponents();
 const host=hostFor('client'),f=TestBed.createComponent(ClientEmployeesComponent);host.append(f.nativeElement);
 f.componentInstance.employees=[{id:'TEST',name:'TEST ONLY VERY LONG EMPLOYEE NAME FOR ALIGNMENT REVIEW',employeeCode:'TEST-0001',isActive:true} as any];f.detectChanges();
 const button=host.querySelector('button.name-link') as HTMLElement;expect(button).toBeTruthy();
 expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth+1);expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);f.destroy();
});

const longRequest = {
  id: 'TEST-INBOX',
  title: 'TEST ONLY — branch license renewal request ' + 'UNBROKENREFERENCE'.repeat(10),
  subtitle: 'BRANCH — ' + 'LONGCLIENTNAME'.repeat(10),
  priority: 'CRITICAL',
  status: 'IN_PROGRESS',
  unreadCount: 12,
  updatedAt: '2026-10-23T05:00:00Z',
};

it.each([320, 390, 768, 1280])('keeps the active inbox card readable and selectable at %s px', async width => {
  await page.viewport(width, 900);
  await TestBed.configureTestingModule({ imports: [ThreadInboxListComponent] }).compileComponents();
  for (const role of ['crm', 'admin']) {
    const host = hostFor(role);
    host.style.display = 'block';
    host.style.width = '280px';
    const main = document.createElement('main');
    host.append(main);
    const fixture = TestBed.createComponent(ThreadInboxListComponent);
    main.append(fixture.nativeElement);
    fixture.componentRef.setInput('items', [longRequest]);
    fixture.componentRef.setInput('selectedId', longRequest.id);
    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    fixture.detectChanges();
    const card = main.querySelector('button')!;
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
    expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);
    const title = card.querySelector('.font-semibold')!;
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth + 1);
    const titleRect = title.getBoundingClientRect();
    const badges = card.querySelector('ui-priority-chip')!.getBoundingClientRect();
    expect(titleRect.right).toBeLessThanOrEqual(badges.left);
    expect(card.classList.contains('bg-brand-50')).toBe(true);
    card.click();
    expect(selected).toHaveBeenCalledWith(longRequest);
    fixture.destroy();
    host.remove();
  }
});

it.each([320, 390, 768, 1280])('contains long requests in the actual thread workspace at %s px', async width => {
  await page.viewport(width, 900);
  await TestBed.configureTestingModule({ imports: [ThreadLayoutComponent] }).compileComponents();
  const host = hostFor('crm');
  host.style.display = 'block';
  host.style.width = '100%';
  const main = document.createElement('main');
  host.append(main);
  const fixture = TestBed.createComponent(ThreadLayoutComponent);
  main.append(fixture.nativeElement);
  const read = vi.fn(() => of({ id: longRequest.id, subject: longRequest.title, status: 'OPEN', type: 'LICENSE', messages: [] }));
  fixture.componentRef.setInput('api', {
    list: () => of({ items: [{ id: longRequest.id, subject: longRequest.title, fromRole: 'BRANCH', fromName: longRequest.subtitle, priority: 'CRITICAL', status: 'OPEN' }], total: 1, page: 1, limit: 20 }),
    read,
  });
  fixture.detectChanges();
  const inbox = main.querySelector('ui-thread-inbox-list')!;
  const card = inbox.querySelector('button')!;
  expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  card.click();
  fixture.detectChanges();
  expect(read).toHaveBeenCalledWith(longRequest.id);
  expect(fixture.componentInstance.selectedId).toBe(longRequest.id);
  expect(fixture.componentInstance.showDetail).toBe(true);
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  fixture.componentInstance.backToList();
  fixture.detectChanges();
  expect(fixture.componentInstance.showDetail).toBe(false);
  fixture.destroy();
});
