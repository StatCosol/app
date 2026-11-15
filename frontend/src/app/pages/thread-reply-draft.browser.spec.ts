import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreadLayoutComponent } from '../shared/thread/components/thread-layout/thread-layout.component';

afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-reply-test]').forEach(n => n.remove()); });

for (const width of [390, 768, 1440]) {
  it.each(['same-thread', 'switch-thread', 'failure'])(`preserves reply text and files for %s at ${width}px`, async scenario => {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({imports:[ThreadLayoutComponent], providers:[provideZonelessChangeDetection()]}).compileComponents();
    const response = new Subject<void>();
    const items = ['TEST-A','TEST-B'].map(id=>({id,subject:id,type:'GENERAL',status:'OPEN',fromRole:'CLIENT',unread:false}));
    const reply = vi.fn(()=>response);
    const fixture = TestBed.createComponent(ThreadLayoutComponent);
    fixture.componentRef.setInput('api', {list:()=>of({items,total:2,page:1,limit:20}), read:(id:string)=>of({...items.find(i=>i.id===id),messages:[]}),reply});
    const host=document.createElement('app-client-layout'); host.className='workspace-ui'; host.setAttribute('data-reply-test',''); host.style.display='block'; document.body.append(host); host.append(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable();
    const select=async(id:string)=>{Array.from(host.querySelectorAll<HTMLButtonElement>('ui-thread-inbox-list button')).find(b=>b.textContent?.includes(id))!.click(); await fixture.whenStable();};
    const type=async(text:string)=>{const t=host.querySelector('textarea')!; t.value=text;t.dispatchEvent(new Event('input',{bubbles:true}));await fixture.whenStable();};
    await select('TEST-A'); await type('TEST original');
    const send=Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Send')!;
    send.click();await fixture.whenStable();expect(send.disabled).toBe(true);
    await type('TEST newer A');
    const file=new File(['%PDF synthetic'],'TEST-only.pdf',{type:'application/pdf'});
    const transfer=new DataTransfer();transfer.items.add(file);
    const fileInput=host.querySelector<HTMLInputElement>('input[type=file]')!;fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));await fixture.whenStable();
    if(scenario!=='same-thread'){fixture.componentInstance.backToList();await fixture.whenStable();await select('TEST-B');await type('TEST newer B');}
    if(scenario==='failure')response.error(Error('TEST outage'));else{response.next();response.complete();}await fixture.whenStable();
    expect(reply).toHaveBeenCalledExactlyOnceWith('TEST-A','TEST original',[]);
    if(scenario!=='same-thread'){
      expect(host.querySelector('textarea')!.value).toBe('TEST newer B');
      if(scenario==='failure')expect(host.querySelector('[role=alert]')?.textContent).toContain('TEST-A');
      fixture.componentInstance.backToList();await fixture.whenStable();await select('TEST-A');
    }
    expect(host.querySelector('textarea')!.value).toBe('TEST newer A');
    expect(fixture.componentInstance.composer!.files.map(f=>f.name)).toEqual(['TEST-only.pdf']);
    expect(host.scrollWidth).toBeLessThanOrEqual(width+1);fixture.destroy();
  });
}
