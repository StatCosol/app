import '@angular/compiler';
import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ThreadLayoutComponent } from './components/thread-layout/thread-layout.component';
import { ComposerComponent } from './components/composer/composer.component';
import { ThreadListItem } from './models/thread.model';

function setup() {
  const response = new Subject<void>();
  const c = new ThreadLayoutComponent({ markForCheck: vi.fn() } as any);
  const api = {
    list: vi.fn(() => of({items: [], total: 0, page: 1, limit: 20})),
    read: vi.fn((id: string) => of({id, subject: id, type: 'GENERAL' as const, status: 'OPEN' as const, messages: []})),
    reply: vi.fn(() => response),
  };
  c.api = api; c.composer = new ComposerComponent();
  c.selectThread({id: 'TEST-A'} as ThreadListItem);
  c.composer.message = 'TEST original';
  return {c, api, response};
}

describe('Reply completion preserves newer per-thread drafts', () => {
  it('retains newer typing while a reply is pending', () => {
    const {c, response} = setup();
    c.sendReply({message: c.composer!.message, files: []});
    c.composer!.message = 'TEST newer reply'; response.next();
    expect(c.composer!.message).toBe('TEST newer reply'); c.ngOnDestroy();
  });
  it('retains a changed attachment even when the message is unchanged', () => {
    const {c, response} = setup(); const first = {name:'TEST-first.pdf'} as File, second = {name:'TEST-second.pdf'} as File;
    c.composer!.files = [first]; c.sendReply({message:c.composer!.message, files:[first]});
    c.composer!.files = [second]; response.next();
    expect(c.composer!.files).toEqual([second]); expect(c.composer!.message).toBe('TEST original'); c.ngOnDestroy();
  });
  it('retains edits saved while navigating away from the sending thread', () => {
    const {c, response} = setup(); c.sendReply({message:c.composer!.message, files:[]});
    c.composer!.message = 'TEST newer A'; c.selectThread({id:'TEST-B'} as ThreadListItem);
    c.composer!.message = 'TEST draft B'; response.next();
    expect(c.composer!.message).toBe('TEST draft B');
    c.selectThread({id:'TEST-A'} as ThreadListItem); expect(c.composer!.message).toBe('TEST newer A'); c.ngOnDestroy();
  });
  it('identifies the original thread when a reply fails after navigation', () => {
    const {c, response} = setup(); c.sendReply({message:c.composer!.message, files:[]});
    c.selectThread({id:'TEST-B'} as ThreadListItem); response.error(Error('TEST failure'));
    expect(c.replyError).toContain('TEST-A'); c.ngOnDestroy();
  });
  it('clears an unchanged successful draft, including whitespace', () => {
    const {c, response} = setup(); c.composer!.message = '  TEST original  ';
    c.sendReply({message:'TEST original',files:[]}); response.next();
    expect(c.composer!.message).toBe(''); c.ngOnDestroy();
  });
  it('blocks duplicate sends and preserves failed drafts for retry', () => {
    const {c,api,response} = setup(); const payload={message:'TEST original', files:[]};
    c.sendReply(payload); c.sendReply(payload); expect(api.reply).toHaveBeenCalledTimes(1);
    response.error(Error('TEST failure')); expect(c.composer!.message).toBe('TEST original'); expect(c.sending).toBe(false);
    const retry = new Subject<void>(); api.reply.mockReturnValue(retry); c.sendReply(payload); retry.next();
    expect(c.composer!.message).toBe(''); c.ngOnDestroy();
  });
});
