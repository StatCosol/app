import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ThreadLayoutComponent } from './components/thread-layout/thread-layout.component';
import { ComposerComponent } from './components/composer/composer.component';
import { ThreadDetail, ThreadListItem } from './models/thread.model';

function setup(action: 'close' | 'resolve' | 'reopen') {
  const response = new Subject<void>();
  const component = new ThreadLayoutComponent({ markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
  const detail = (id: string): ThreadDetail => ({ id, subject: `TEST ONLY ${id}`, type: 'GENERAL', status: action === 'reopen' ? 'CLOSED' : 'OPEN', messages: [] });
  const api = {
    list: vi.fn(() => of({ items: [], total: 0, page: 1, limit: 20 })),
    read: vi.fn((id: string) => of(detail(id))),
    reply: vi.fn(() => of(undefined)),
    close: vi.fn(() => response), resolve: vi.fn(() => response), reopen: vi.fn(() => response),
  };
  component.api = api;
  component.canResolve = true;
  component.selectThread({ id: 'TEST-A' } as ThreadListItem);
  return { component, api, response };
}

describe('Thread status action scope', () => {
  it.each(['close', 'resolve', 'reopen'] as const)('leaves another thread loading after %s completes', action => {
    const { component, api, response } = setup(action);
    const pendingRead = new Subject<ThreadDetail>();
    component[`${action}Thread`]();
    api.read.mockReturnValueOnce(pendingRead as never);
    component.selectThread({ id: 'TEST-B' } as ThreadListItem);
    response.next();
    expect(component.loadingThread).toBe(true);
    expect(component.selected).toBeUndefined();
    expect(api.read).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  });

  it.each(['close', 'resolve', 'reopen'] as const)('blocks duplicate %s requests and replies until completion', action => {
    const { component, api, response } = setup(action);
    component[`${action}Thread`]();
    component[`${action}Thread`]();
    component.sendReply({ message: 'TEST ONLY draft', files: [] });
    expect(component.statusUpdating).toBe(true);
    expect(api[action]).toHaveBeenCalledTimes(1);
    expect(api.reply).not.toHaveBeenCalled();
    response.next();
    expect(component.statusUpdating).toBe(false);
    expect(api.read.mock.calls.map(call => call[0])).toEqual(['TEST-A', 'TEST-A']);
    component.ngOnDestroy();
  });

  it.each(['close', 'resolve', 'reopen'] as const)('retains draft and identifies failed %s after switching threads', action => {
    const { component, api, response } = setup(action);
    component.composer = new ComposerComponent();
    component.composer.message = 'TEST ONLY original draft';
    const file = {} as File;
    component.composer.files = [file];
    component[`${action}Thread`]();
    component.selectThread({ id: 'TEST-B' } as ThreadListItem);
    component.composer.message = 'TEST ONLY second draft';
    response.error(new Error('test failure'));
    expect(component.statusUpdating).toBe(false);
    expect(component.statusError).toContain('TEST-A');
    expect(component.statusError).not.toContain('TEST-B');
    expect(component.composer.message).toBe('TEST ONLY second draft');
    expect(api.read).toHaveBeenCalledTimes(2);
    component.selectThread({ id: 'TEST-A' } as ThreadListItem);
    expect(component.composer.message).toBe('TEST ONLY original draft');
    expect(component.composer.files).toEqual([file]);
    component.ngOnDestroy();
  });

  it('stops status callbacks when leaving the workspace', () => {
    const { component, api, response } = setup('close');
    component.closeThread();
    component.ngOnDestroy();
    expect(response.observed).toBe(false);
    response.next();
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(api.list).not.toHaveBeenCalled();
  });

  it('honors action permissions and lifecycle state', () => {
    const { component, api } = setup('close');
    component.canClose = false;
    component.canResolve = false;
    component.closeThread(); component.resolveThread(); component.reopenThread();
    expect(api.close).not.toHaveBeenCalled();
    expect(api.resolve).not.toHaveBeenCalled();
    expect(api.reopen).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each(['close', 'resolve', 'reopen'] as const)('does not reload another thread after a delayed %s', action => {
    const { component, api, response } = setup(action);
    component[`${action}Thread`]();
    component.selectThread({ id: 'TEST-B' } as ThreadListItem);
    response.next();
    response.complete();
    expect(api[action]).toHaveBeenCalledExactlyOnceWith('TEST-A');
    expect(api.read.mock.calls.map(call => call[0])).toEqual(['TEST-A', 'TEST-B']);
    expect(component.selectedId).toBe('TEST-B');
    expect(component.selected?.id).toBe('TEST-B');
    component.ngOnDestroy();
  });
});
