import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { ClientAppraisalTemplatesComponent } from './client-appraisal-templates.component';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { PageHeaderComponent } from '../../../shared/ui';
afterEach(()=>TestBed.resetTestingModule());
describe.each([390,768,1440])('Template workspace at %ipx',width=>{
 beforeEach(async()=>page.viewport(width,900));
 async function setup(svc:any){
  await TestBed.configureTestingModule({imports:[ClientAppraisalTemplatesComponent],providers:[provideRouter([]),{provide:PerformanceAppraisalService,useValue:svc}]})
   .overrideComponent(ClientAppraisalTemplatesComponent,{remove:{imports:[PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const f=TestBed.createComponent(ClientAppraisalTemplatesComponent),dom=f.nativeElement as HTMLElement;
  const render=async()=>{f.changeDetectorRef.markForCheck();f.detectChanges();await f.whenStable();f.changeDetectorRef.markForCheck();f.detectChanges();};
  await render();return{f,dom,render};
 }
 it('shows read errors and retries without presenting unavailable data as empty',async()=>{
  const read=new Subject<any>(),svc={getTemplates:vi.fn(()=>read)};const f=await setup(svc);read.error(Error('Synthetic outage'));await f.render();
  expect(f.dom.textContent).toContain('could not be loaded');expect(f.dom.textContent).not.toContain('No templates yet');
  svc.getTemplates.mockReturnValue(of([]) as any);const retry=Array.from(f.dom.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Retry')!;
  expect(retry.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);retry.click();await f.render();expect(f.dom.textContent).toContain('No templates yet');expect(f.dom.querySelector('[role="alert"]')).toBeNull();
 });
 it('keeps newer form edits, labels controls and recovers from save errors',async()=>{
  const save=new Subject<any>(),svc={getTemplates:vi.fn(()=>of([])),createTemplate:vi.fn(()=>save)};const f=await setup(svc);
  f.dom.querySelector<HTMLButtonElement>('[aria-label="New Template"]')!.click();await f.render();
  expect(f.dom.querySelector<HTMLButtonElement>('[aria-label="Close Form"]')!.textContent).toContain('Close Form');
  for(const [id,value]of Object.entries({'tpl-code':'TEST-RATING','tpl-name':'Synthetic first'})){const input=f.dom.querySelector<HTMLInputElement>('#'+id)!;input.value=value;input.dispatchEvent(new Event('input'));}
  await f.render();const submit=f.dom.querySelector<HTMLButtonElement>('[aria-label="Create Template"]')!;expect(submit.textContent).toContain('Create Template');submit.click();await f.render();expect(submit.disabled).toBe(true);expect(f.dom.querySelector<HTMLButtonElement>('[aria-label="Close Form"]')!.disabled).toBe(true);
  const name=f.dom.querySelector<HTMLInputElement>('#tpl-name')!;name.value='Synthetic next';name.dispatchEvent(new Event('input'));await f.render();save.next({id:'TEST-NEW'});save.complete();await f.render();expect(name.value).toBe('Synthetic next');expect(f.dom.textContent).toContain('newer form edits have been kept');expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  const retry=new Subject<any>();svc.createTemplate.mockReturnValue(retry);submit.click();await f.render();retry.error(Error('Synthetic failure'));await f.render();expect(f.dom.textContent).toContain('Template creation failed');expect(name.value).toBe('Synthetic next');expect(submit.disabled).toBe(false);
  f.dom.querySelector<HTMLButtonElement>('[aria-label="Close Form"]')!.click();await f.render();expect(f.dom.querySelector('#tpl-name')).toBeNull();expect(f.dom.querySelector('[aria-label="New Template"]')).not.toBeNull();
 });
});
