import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { FormInputComponent } from './ui/form-input/form-input.component';
import { FormSelectComponent } from './ui/form-select/form-select.component';
import { ActionButtonComponent } from './ui/action-button/action-button.component';

@Component({standalone:true,imports:[FormInputComponent,FormSelectComponent,ActionButtonComponent],template:`
 <main style="padding:12px">
  <form class="grid grid-cols-1 md:grid-cols-2 gap-4">
   <ui-form-input label="Employee name" error="Enter a name before saving" />
   <ui-form-select label="Employment category" [options]="options" hint="Select the reviewed category" />
   <label>Joining date<input type="date" class="block w-full" /></label>
   <label>Pay period<input type="month" class="block w-full" /></label>
   <label>Remarks<textarea rows="4" class="block w-full"></textarea></label>
   <label>Selected branches<select multiple size="4" class="block w-full"><option>Test branch A</option><option>Test branch B</option></select></label>
   <label><input type="checkbox" /> Confirm test data</label>
   <label><input type="radio" name="test" /> Draft only</label>
   <input type="hidden" value="test" />
  </form>
  <div class="aligned-filter-controls flex items-center" style="margin-top:16px">
   <label>Period<input aria-label="Filter period" type="month" style="width:150px" /></label>
   <label>Evidence type<select aria-label="Evidence type" style="width:130px"><option>Test evidence</option></select></label>
   <ui-button label="Filter" icon="filter" [iconOnly]="true">Filter</ui-button>
  </div>
  <div class="form-actions flex" style="margin-top:16px">
   <label class="btn border">Choose evidence<input type="file" hidden /></label>
   <button class="compact-action" data-action-label="Review the evidence uploaded for this test period" aria-label="Review evidence">✓</button>
   <ui-button variant="secondary" [disabled]="true">Save draft</ui-button>
  </div>
 <div class="long-label" style="width:200px;max-width:100%;margin-top:12px"><ui-button>Download the corrected evidence and all supporting attachments</ui-button></div>
 <nav class="overflow-x-auto flex" aria-label="Escalation categories" style="width:240px;max-width:100%"><button class="whitespace-nowrap">Overdue compliance</button><button class="whitespace-nowrap">Repeat Defaults</button><button class="whitespace-nowrap">Critical Audits</button><button class="whitespace-nowrap">SLA Breached</button></nav>
 </main>`})
class RemainingFormFixture { options=[{value:'TEST',label:'Test category'}]; }

afterEach(()=>{TestBed.resetTestingModule();document.querySelectorAll('[data-remaining-form-test]').forEach(e=>e.remove());});
describe.each(['client','branch','crm','auditor','contractor','payroll','cco'])('%s remaining form geometry',role=>{
 it.each([320,390,768,1280])('keeps mixed fields/actions consistent at %s px without shrinking multiline fields',async width=>{
  await page.viewport(width,1000);
  await TestBed.configureTestingModule({imports:[RemainingFormFixture]}).compileComponents();
  const host=document.createElement(`app-${role}-layout`);host.className='workspace-ui';host.setAttribute('data-remaining-form-test','');document.body.append(host);
  const f=TestBed.createComponent(RemainingFormFixture);host.append(f.nativeElement);f.detectChanges();await f.whenStable();
  const expected=width<1024?44:40;
  const inputs=[...host.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]),select:not([multiple])')] as HTMLElement[];
  for(const input of inputs){expect(Math.abs(input.getBoundingClientRect().height-expected)).toBeLessThanOrEqual(1);}
  for(const control of host.querySelectorAll('.form-actions button,.form-actions label')) expect((control as HTMLElement).getBoundingClientRect().height).toBe(expected);
  const period=host.querySelector('[aria-label="Filter period"]')!.getBoundingClientRect();
  const select=host.querySelector('[aria-label="Evidence type"]')!.getBoundingClientRect();
  if(Math.abs(period.top-select.top)<expected) expect(Math.abs(period.bottom-select.bottom)).toBeLessThanOrEqual(1);
  expect(host.querySelector('textarea')!.getBoundingClientRect().height).toBeGreaterThan(expected*1.5);
  expect(host.querySelector('select[multiple]')!.getBoundingClientRect().height).toBeGreaterThan(expected*1.5);
  expect(host.querySelector('input[type="checkbox"]')!.getBoundingClientRect().height).toBeLessThan(30);
  expect(host.querySelector('input[type="hidden"]')!.getBoundingClientRect().height).toBe(0);
  expect(host.querySelector('input[type="file"]')!.getBoundingClientRect().height).toBe(0);
  const error=host.querySelector('[role="alert"]')!;expect(error.getBoundingClientRect().height).toBeGreaterThan(0);
  expect(error.getBoundingClientRect().top).toBeGreaterThanOrEqual(inputs[0].getBoundingClientRect().bottom);
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  const longButton=host.querySelector('.long-label button')!;
  expect(longButton.getBoundingClientRect().height).toBeGreaterThan(expected);
  expect(longButton.scrollHeight).toBeLessThanOrEqual(longButton.clientHeight+1);
  expect(longButton.getBoundingClientRect().right).toBeLessThanOrEqual(width);
  const tabs=host.querySelector('nav')!;expect(tabs.scrollWidth).toBeGreaterThan(tabs.clientWidth);
  for(const button of tabs.querySelectorAll('button')) expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth+1);
  const action=host.querySelector('.compact-action') as HTMLElement;action.focus();
  expect(getComputedStyle(action,'::after').maxWidth).not.toBe('none');
  f.destroy();
 });
});
