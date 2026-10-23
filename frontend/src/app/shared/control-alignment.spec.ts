import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { page } from 'vitest/browser';
import { FormSelectComponent } from './ui/form-select/form-select.component';
import { ActionButtonComponent } from './ui/action-button/action-button.component';
import { AuditFilePreviewComponent } from './files/components/audit-file-preview.component';
import { ProtectedFileService } from './files/services/protected-file.service';

@Component({standalone:true,imports:[FormsModule,FormSelectComponent,ActionButtonComponent],template:`
 <main><div class="fixture-primary aligned-filter-controls flex flex-wrap items-center gap-3">
   <input aria-label="Search" style="width:120px" placeholder="Search" />
   <ui-form-select style="width:120px" label="Status requiring review" [options]="options" />
   <button class="compact-action" aria-label="Export">↓</button>
   <ui-button label="Download" [iconOnly]="true" icon="download">Download</ui-button><span class="filter-meta">3 CRMs</span>
 </div><div class="fixture-secondary aligned-filter-controls flex flex-wrap items-center gap-3" style="margin-top:12px">
  <label>Default branch<select class="ml-2" style="width:140px"><option>BRM</option></select></label>
  <button class="standard-action">Download template</button>
 </div></main>`})
class FilterRowFixture { options=[{label:'All',value:''}]; }

afterEach(()=>{TestBed.resetTestingModule();document.querySelectorAll('[data-alignment-test]').forEach(e=>e.remove());});

describe.each(['client','branch','crm','auditor','contractor','payroll','cco'])('%s field/action alignment',role=>{
 it.each([390,768,1280])('aligns labelled selects, search and both action types at %s px',async width=>{
  await page.viewport(width,900);
  await TestBed.configureTestingModule({imports:[FilterRowFixture]}).compileComponents();
  const host=document.createElement(`app-${role}-layout`);host.className='workspace-ui';host.setAttribute('data-alignment-test','');document.body.append(host);
  const fixture=TestBed.createComponent(FilterRowFixture);host.append(fixture.nativeElement);fixture.detectChanges();await fixture.whenStable();
  const controls=[...fixture.nativeElement.querySelectorAll('.fixture-primary input,.fixture-primary select,.fixture-primary button')] as HTMLElement[];
  const rects=controls.map(e=>e.getBoundingClientRect());
  expect(rects.length).toBe(4);
  const expected=width<1024?44:40;
  for(const rect of rects) expect(Math.abs(rect.height-expected)).toBeLessThanOrEqual(1);
  // The long labelled select and the unlabelled input share a flex line.
  expect(Math.abs(rects[0].bottom-rects[1].bottom)).toBeLessThanOrEqual(1);
  for(const r of rects.slice(2)) if(r.top<rects[1].bottom) expect(Math.abs(r.bottom-rects[1].bottom)).toBeLessThanOrEqual(1);
  const meta=fixture.nativeElement.querySelector('.filter-meta').getBoundingClientRect();
  expect(meta.height).toBe(expected);
  if(Math.abs(meta.bottom-rects[1].bottom)<1) expect(Math.abs((meta.top+meta.bottom)/2-(rects[1].top+rects[1].bottom)/2)).toBeLessThanOrEqual(1);
  const secondary=fixture.nativeElement.querySelector('.fixture-secondary');
  const label=secondary.querySelector('label').getBoundingClientRect(), select=secondary.querySelector('select').getBoundingClientRect(), action=secondary.querySelector('button').getBoundingClientRect();
  expect(Math.abs(label.left-select.left)).toBeLessThanOrEqual(1);
  if(action.top<select.bottom) expect(Math.abs(select.bottom-action.bottom)).toBeLessThanOrEqual(1);
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  fixture.destroy();
 });
});

describe('Preview toolbar alignment',()=>{
 it.each([320,390,768,1280])('aligns Zoom with Download and keeps pagination together at %s px',async width=>{
  await page.viewport(width,900);
  await TestBed.configureTestingModule({imports:[AuditFilePreviewComponent],providers:[{provide:ProtectedFileService,useValue:{}}]}).compileComponents();
  const fixture=TestBed.createComponent(AuditFilePreviewComponent);fixture.nativeElement.setAttribute('data-alignment-test','');document.body.append(fixture.nativeElement);
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  fixture.componentRef.setInput('request',{name:'TEST.png',blob:new Blob([bytes],{type:'image/png'})});fixture.detectChanges();
  await vi.waitFor(()=>expect(fixture.componentInstance.loading).toBe(false));fixture.detectChanges();
  const zoom=fixture.nativeElement.querySelector('[aria-label="Preview zoom"]') as HTMLElement;
  const download=[...fixture.nativeElement.querySelectorAll('button')].find((e:any)=>e.textContent.includes('Download original')) as HTMLElement;
  const a=zoom.getBoundingClientRect(), b=download.getBoundingClientRect();
  expect(a.height).toBe(44);expect(b.height).toBe(44);
  if(width>=390) {expect(Math.abs(a.top-b.top)).toBeLessThanOrEqual(1);expect(Math.abs(a.bottom-b.bottom)).toBeLessThanOrEqual(1);}
  expect(a.right).toBeLessThanOrEqual(width);expect(b.right).toBeLessThanOrEqual(width);
  fixture.componentInstance.pages=3;fixture.detectChanges();
  const group=fixture.nativeElement.querySelector('.page-controls') as HTMLElement;
  expect(group.getBoundingClientRect().width).toBeLessThanOrEqual(width);
  expect(group.querySelectorAll('button').length).toBe(2);
  fixture.destroy();
 });
});
