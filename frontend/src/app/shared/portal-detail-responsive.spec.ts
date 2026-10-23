import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { actionIconName } from './ui/action-icon.pipe';
import { SharedFilePreviewModalComponent } from './components/file-preview/shared-file-preview-modal.component';
import { AuditFilePreviewComponent } from './files/components/audit-file-preview.component';
import { ProtectedFileService } from './files/services/protected-file.service';
import { ClientUnitDocumentsComponent } from '../pages/client/unit-documents/client-unit-documents.component';
import { BranchUnitDocumentsComponent } from '../pages/branch/branch-unit-documents/branch-unit-documents.component';
import { CrmUnitDocumentsComponent } from '../pages/crm/unit-documents/crm-unit-documents.component';
import { ComplianceDocumentRecordsComponent } from './compliance/compliance-document-records.component';

afterEach(() => {
  TestBed.resetTestingModule();
  document.querySelectorAll('[data-detail-test]').forEach(el => el.remove());
});

describe('Actions have distinct meanings', () => {
  it.each([
    ['Refresh','refresh'], ['Retry documents','refresh'],
    ['Generate register','document-plus'], ['Calculate gratuity','calculator'],
    ['Run EL Accrual','calculator'], ['Run preview','eye'], ['Run now','play'],
    ['Generate PIN','key'], ['Load records','folder-open'],
    ['Load more attendance','chevron-down'], ['Load type checklist','clipboard-check'],
  ])('%s uses %s', (label, icon) => expect(actionIconName(label)).toBe(icon));
});

describe('Protected unit-document preview routing', () => {
  it('previews shared compliance submissions in-page and leaves protected downloads intact', () => {
    const context:any={documentPreview:null,files:{open:vi.fn(),download:vi.fn(()=>({pipe:()=>({subscribe:vi.fn()})}))}};
    ComplianceDocumentRecordsComponent.prototype.open.call(context,{uploadedFileUrl:'/api/protected/TEST.pdf',uploadedFileName:'TEST.pdf'} as any);
    expect(context.documentPreview).toEqual({url:'/api/protected/TEST.pdf',name:'TEST.pdf'});
    expect(context.files.open).not.toHaveBeenCalled();
    ComplianceDocumentRecordsComponent.prototype.open.call(context,{uploadedFileUrl:'/api/protected/TEST.pdf',uploadedFileName:'TEST.pdf'} as any,true);
    expect(context.files.download).toHaveBeenCalledWith('/api/protected/TEST.pdf','TEST.pdf');
  });
  it.each([
    ['client',ClientUnitDocumentsComponent,'view'],
    ['branch',BranchUnitDocumentsComponent,'view'],
    ['crm',CrmUnitDocumentsComponent,'viewDoc'],
  ])('%s opens the protected document in the page without a popup', (role, Component, method) => {
    const api={downloadUrl:vi.fn((id,scope)=>`/api/${scope}/unit-documents/${id}/download`)};
    const context:any={api,documentPreview:null,protectedFiles:{open:vi.fn()}};
    (Component.prototype as any)[method].call(context,{id:'test-id',fileName:'TEST.pdf'});
    expect(context.documentPreview).toEqual({url:`/api/${role}/unit-documents/test-id/download`,name:'TEST.pdf'});
    expect(context.protectedFiles.open).not.toHaveBeenCalled();
  });
});

describe.each(['client','branch','crm','auditor','contractor','payroll','cco'])('%s visual contract', role => {
  it.each([390,768])('keeps semantic colours and wraps a long action at %s px', async width => {
    await page.viewport(width,844);
    const host=document.createElement(`app-${role}-layout`);
    host.className='workspace-ui'; host.setAttribute('data-detail-test','');
    host.innerHTML=`<main><div class="dash-hero"><h1>TEST Portal</h1></div>
      <button class="standard-action btn-primary">Generate and save a very long TEST monthly register for the selected unit</button>
      <button class="btn-danger">Reject</button>
      <button class="compact-action" data-action-icon="trash">X</button></main>`;
    document.body.append(host);
    const primary=host.querySelector('.btn-primary') as HTMLElement;
    expect(getComputedStyle(primary).backgroundColor).toBe('rgb(17, 102, 83)');
    expect(getComputedStyle(host.querySelector('.dash-hero')!).backgroundColor).toBe('rgb(22, 63, 50)');
    expect(getComputedStyle(host.querySelector('.dash-hero h1')!).color).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(host.querySelector('[data-action-icon=trash]')!).color).toBe('rgb(220, 38, 38)');
    expect(primary.getBoundingClientRect().width).toBeLessThanOrEqual(width);
    expect(primary.getBoundingClientRect().height).toBeGreaterThanOrEqual(primary.scrollHeight-1);
    expect(getComputedStyle(host.querySelector('.btn-danger')!).backgroundColor).not.toBe('rgb(17, 102, 83)');
  });
});

describe('Long preview on a small screen', () => {
  it.each([390,768])('keeps file-preview footer visible with long version history at %s px', async width => {
    await page.viewport(width,844);
    await TestBed.configureTestingModule({imports:[SharedFilePreviewModalComponent]}).compileComponents();
    const fixture=TestBed.createComponent(SharedFilePreviewModalComponent);
    fixture.nativeElement.setAttribute('data-detail-test',''); document.body.append(fixture.nativeElement);
    fixture.componentRef.setInput('open',true);
    fixture.componentRef.setInput('file',{id:'test',name:'TEST '+ 'Long filename '.repeat(12),mimeType:'text/plain',
      versions:Array.from({length:30},(_,i)=>({id:String(i),label:`TEST version ${i}`}))});
    fixture.detectChanges(); await fixture.whenStable();
    const panel=fixture.nativeElement.querySelector('[role=dialog]') as HTMLElement;
    const footer=fixture.nativeElement.querySelector('.file-preview-footer') as HTMLElement;
    const body=fixture.nativeElement.querySelector('.file-preview-body') as HTMLElement;
    expect(panel.getBoundingClientRect().height).toBeLessThanOrEqual(844);
    expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(844);
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    expect(fixture.nativeElement.scrollWidth).toBeLessThanOrEqual(width);
    const close=fixture.nativeElement.querySelector('button') as HTMLElement;
    await vi.waitFor(()=>expect(panel.contains(document.activeElement)).toBe(true));
    const dismissed=vi.fn(); fixture.componentInstance.closed.subscribe(dismissed);
    close.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    expect(dismissed).toHaveBeenCalledOnce();
    fixture.destroy();
  });
  it.each([390,768])('scrolls wide worksheets within the audit preview at %s px', async width => {
    await page.viewport(width,844);
    await TestBed.configureTestingModule({imports:[AuditFilePreviewComponent],providers:[
      {provide:ProtectedFileService,useValue:{}}
    ]}).compileComponents();
    const fixture=TestBed.createComponent(AuditFilePreviewComponent);
    const nested=document.createElement('div');nested.setAttribute('data-detail-test','');
    nested.style.cssText='transform:translateY(0);contain:layout;position:relative;margin-top:600px;height:1600px;';
    document.body.append(nested);nested.append(fixture.nativeElement);
    fixture.componentRef.setInput('request',{name:'TEST.csv',blob:new Blob(['a,b\n1,2'],{type:'text/csv'})});
    fixture.detectChanges();
    await vi.waitFor(()=>expect(fixture.componentInstance.loading).toBe(false));
    fixture.componentInstance.rows=Array.from({length:25},()=>Array.from({length:20},()=> 'TEST long cell value'));
    fixture.detectChanges();
    const body=fixture.nativeElement.querySelector('.body') as HTMLElement;
    const table=body.querySelector('table') as HTMLElement;
    expect(Math.max(body.scrollWidth-body.clientWidth,table.scrollWidth-table.clientWidth)).toBeGreaterThan(0);
    const rect=fixture.nativeElement.querySelector('section').getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(0);expect(rect.bottom).toBeLessThanOrEqual(844);
    expect(rect.left).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(width);
    expect(fixture.nativeElement.parentElement).toBe(document.body);
    expect(fixture.nativeElement.scrollWidth).toBeLessThanOrEqual(width);
    const dismissed=vi.fn(); fixture.componentInstance.closed.subscribe(dismissed);
    fixture.nativeElement.querySelector('button').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    expect(dismissed).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
