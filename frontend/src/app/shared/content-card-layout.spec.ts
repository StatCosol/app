import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
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
 f.componentRef.setInput('items',[{id:'TEST',type:'COMPLIANCE',status:'OPEN',subject:'TEST ONLY — a very long registration request subject for layout verification',fromName:'Synthetic requester',clientName:'Test company',lastMessageAt:'2026-01-01'}]);f.detectChanges();
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
