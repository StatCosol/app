import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { ComposerComponent } from './components/composer/composer.component';

const file=(name='TEST.pdf',type='application/pdf',size=20)=>({name,type,size}) as File;
function setup(){const c=new ComposerComponent();c.clearOnSend=false;c.message='TEST evidence';const send=vi.fn();c.send.subscribe(send);return {c,send};}
describe('Support attachment submission contract',()=>{
  it('keeps an attachment-only draft without sending an invalid request',()=>{const {c,send}=setup();c.message=' ';c.files=[file()];c.submit();expect(send).not.toHaveBeenCalled();expect(c.files).toHaveLength(1);});
  it('blocks more than five files',()=>{const {c,send}=setup();c.files=Array.from({length:6},()=>file());c.submit();expect(send).not.toHaveBeenCalled();});
  it('blocks a file over 10 MB',()=>{const {c,send}=setup();c.files=[file('TEST.pdf','application/pdf',10*1024*1024+1)];c.submit();expect(send).not.toHaveBeenCalled();});
  it.each([['TEST.txt','text/plain'],['TEST.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['TEST.pdf','image/png'],['TEST.pdf',''],['pdf','application/pdf']])('blocks unsupported or mismatched metadata %s / %s',(name,type)=>{const {c,send}=setup();c.files=[file(name,type)];c.submit();expect(send).not.toHaveBeenCalled();expect(c.files).toHaveLength(1);});
  it('accepts five supported files at the limit with a message',()=>{const {c,send}=setup();c.files=Array.from({length:5},()=>file('TEST.PDF','application/pdf',10*1024*1024));c.submit();expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0].files).toHaveLength(5);});
  it('can send after removing the unsupported attachment',()=>{const {c,send}=setup();c.files=[file('TEST.txt','text/plain'),file()];c.submit();expect(send).not.toHaveBeenCalled();c.removeFile(0);c.submit();expect(send).toHaveBeenCalledOnce();});
});
