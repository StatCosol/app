import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreadLayoutComponent } from '../shared/thread/components/thread-layout/thread-layout.component';

afterEach(() => {
  TestBed.resetTestingModule();
  document.querySelectorAll('[data-thread-test]').forEach(node => node.remove());
});

for (const role of ['client', 'branch', 'crm', 'auditor', 'contractor', 'payroll', 'cco']) {
  it.each([390, 768, 1280])(`keeps synthetic thread actions and navigation scoped in ${role} at %s px`, async width => {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({ imports: [ThreadLayoutComponent], providers: [provideZonelessChangeDetection()] }).compileComponents();
    const response = new Subject<void>();
    const items = ['TEST-A', 'TEST-B'].map(id => ({ id, subject: id, type: 'GENERAL', status: 'OPEN', fromRole: 'CLIENT', unread: false }));
    const read = vi.fn((id: string) => of({ ...items.find(item => item.id === id), messages: [] }));
    const close = vi.fn(() => response);
    const fixture = TestBed.createComponent(ThreadLayoutComponent);
    fixture.componentRef.setInput('api', { list: () => of({ items, total: 2, page: 1, limit: 20 }), read, close, reply: vi.fn() });
    const host = document.createElement(`app-${role}-layout`);
    host.className = 'workspace-ui';
    host.setAttribute('data-thread-test', '');
    host.style.display = 'block';
    const main = document.createElement('main'); host.append(main); document.body.append(host); main.append(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable();
    const buttons = () => [...main.querySelectorAll<HTMLButtonElement>('button')];
    const button = (label: string) => buttons().find(b => b.textContent?.trim() === label)!;
    const select = async (id: string) => { [...main.querySelectorAll<HTMLButtonElement>('ui-thread-inbox-list button')].find(b => b.textContent?.includes(id))!.click(); await fixture.whenStable(); };
    await select('TEST-A');
    button('Close').click(); await fixture.whenStable();
    expect(button('Close').disabled).toBe(true);
    expect(main.querySelector('[role="status"]')?.textContent).toContain('Updating');
    fixture.componentInstance.backToList(); await fixture.whenStable();
    const detailPane = main.querySelector('app-composer')!.parentElement!.parentElement!;
    expect(getComputedStyle(detailPane).display === 'none').toBe(width < 1024);
    await select('TEST-B');
    response.next(); response.complete(); await fixture.whenStable();
    expect(read.mock.calls.map(call => call[0])).toEqual(['TEST-A', 'TEST-B']);
    expect(main.querySelector('h3')?.textContent).toBe('TEST-B');
    expect(button('Close').disabled).toBe(false);
    expect(close).toHaveBeenCalledExactlyOnceWith('TEST-A');
    const textarea = main.querySelector('textarea')!;
    textarea.value = 'TEST ONLY retained draft'; textarea.dispatchEvent(new Event('input', { bubbles: true })); await fixture.whenStable();
    button('Close').click(); await fixture.whenStable();
    expect(fixture.componentInstance.statusUpdating).toBe(false);
    expect(textarea.value).toBe('TEST ONLY retained draft');
    expect(host.scrollWidth).toBeLessThanOrEqual(width + 1);
    fixture.destroy();
  });
}
