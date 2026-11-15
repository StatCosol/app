import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { ComposerComponent } from '../shared/thread/components/composer/composer.component';

afterEach(()=>{TestBed.resetTestingModule();document.querySelectorAll('[data-attachment-test]').forEach(n=>n.remove());});
for(const width of [390,768,1440]){
  it.each(['message-required','unsupported-file','file-count'])(`shows recoverable attachment validation for %s at ${width}px`,async scenario=>{
    await page.viewport(width,900);
    await TestBed.configureTestingModule({imports:[ComposerComponent],providers:[provideZonelessChangeDetection()]}).compileComponents();
    const fixture=TestBed.createComponent(ComposerComponent);fixture.componentRef.setInput('clearOnSend',false);
    const host=document.createElement('main');host.setAttribute('data-attachment-test','');host.className='workspace-ui';host.style.width='100%';document.body.append(host);host.append(fixture.nativeElement);
    const send=vi.fn();fixture.componentInstance.send.subscribe(send);fixture.detectChanges();await fixture.whenStable();
    const input=host.querySelector<HTMLInputElement>('input[type=file]')!,textarea=host.querySelector('textarea')!;
    const button=()=>Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Send')!;
    expect(input.accept).toContain('.pdf');
    const transfer=new DataTransfer();
    const count=scenario==='file-count'?6:1;
    for(let i=0;i<count;i++)transfer.items.add(new File(['%PDF TEST ONLY'],scenario==='unsupported-file'?'TEST-only.txt':`TEST-${i}.pdf`,{type:scenario==='unsupported-file'?'text/plain':'application/pdf'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    if(scenario!=='message-required'){textarea.value='TEST reply';textarea.dispatchEvent(new Event('input',{bubbles:true}));}
    await fixture.whenStable();expect(button().disabled).toBe(true);expect(host.querySelector('[role=alert]')?.textContent).toMatch(scenario==='message-required'?/reply message/:scenario==='unsupported-file'?/not a supported attachment/:/up to five/);
    fixture.componentInstance.submit();expect(send).not.toHaveBeenCalled();
    if(scenario==='message-required'){textarea.value='TEST reply';textarea.dispatchEvent(new Event('input',{bubbles:true}));}
    else host.querySelector<HTMLButtonElement>('button[aria-label^="Remove "]')!.click();
    await fixture.whenStable();expect(host.querySelector('[role=alert]')).toBeNull();expect(button().disabled).toBe(false);
    button().click();await fixture.whenStable();expect(send).toHaveBeenCalledOnce();expect(host.scrollWidth).toBeLessThanOrEqual(width+1);
    fixture.componentRef.setInput('disabled',true);await fixture.whenStable();expect(textarea.disabled).toBe(true);expect(input.disabled).toBe(true);fixture.destroy();
  });
}
