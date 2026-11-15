import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreadLayoutComponent } from '../shared/thread/components/thread-layout/thread-layout.component';
import { ClientThreadApiService } from '../core/client-thread-api.service';
import { BranchThreadApiService } from '../core/branch-thread-api.service';
import { CrmThreadApiService } from '../core/crm-thread-api.service';
import { AuditorThreadApiService } from '../core/auditor-thread-api.service';
import { ContractorThreadApiService } from '../core/contractor-thread-api.service';
import { PaydekThreadApiService } from '../core/paydek-thread-api.service';
import { CcoThreadApiService } from '../core/cco-thread-api.service';

afterEach(() => {
  TestBed.resetTestingModule();
  document.querySelectorAll('[data-portal-attachment-test]').forEach((n) => n.remove());
});
const portals = [
  ['Client', ClientThreadApiService],
  ['Branch', BranchThreadApiService],
  ['CRM', CrmThreadApiService],
  ['Auditor', AuditorThreadApiService],
  ['Contractor', ContractorThreadApiService],
  ['PayDek', PaydekThreadApiService],
  ['CCO', CcoThreadApiService],
] as const;
for (const width of [390, 768, 1440])
  for (const [portal, Service] of portals) {
    it(`${portal} retains failed attachments and renders the successful retry at ${width}px (isolated HTTP)`, async () => {
      await page.viewport(width, 900);
      await TestBed.configureTestingModule({
        imports: [ThreadLayoutComponent],
        providers: [provideZonelessChangeDetection()],
      }).compileComponents();
      const response = new Subject<void>(),
        retry = new Subject<void>();
      const row = {
        id: 'TEST-ATTACHMENT',
        subject: 'TEST ONLY attachment thread',
        queryType: 'GENERAL',
        status: 'OPEN',
      };
      let messages: any[] = [];
      const http = {
        get: vi.fn((url: string) =>
          of(
            url.includes('/threads/')
              ? { thread: row, messages }
              : { data: [row], total: 1, page: 1, limit: 20 },
          ),
        ),
        post: vi.fn().mockReturnValueOnce(response).mockReturnValueOnce(retry),
      };
      const fixture = TestBed.createComponent(ThreadLayoutComponent);
      fixture.componentRef.setInput('api', new (Service as any)(http, {}));
      const host = document.createElement('main');
      host.className = 'workspace-ui';
      host.setAttribute('data-portal-attachment-test', '');
      document.body.append(host);
      host.append(fixture.nativeElement);
      fixture.detectChanges();
      await fixture.whenStable();
      host.querySelector<HTMLButtonElement>('ui-thread-inbox-list button')!.click();
      await fixture.whenStable();
      const textarea = host.querySelector('textarea')!;
      textarea.value = 'TEST ONLY attachments';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const files = new DataTransfer();
      for (let i = 1; i <= 5; i++)
        files.items.add(new File(['%PDF TEST ONLY'], `TEST-${i}.pdf`, { type: 'application/pdf' }));
      const savedAttachments = Array.from(files.files).map((f) => ({
        name: f.name,
        url: '/TEST-ONLY/' + f.name,
      }));
      const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
      const send = () =>
        Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => b.textContent?.trim() === 'Send',
        )!;
      send().click();
      await fixture.whenStable();
      expect(send().disabled).toBe(true);
      expect(http.post).toHaveBeenCalledOnce();
      response.error(new Error('TEST upload unavailable'));
      await fixture.whenStable();
      expect(host.querySelector('[role=alert]')?.textContent).toBeTruthy();
      expect(textarea.value).toBe('TEST ONLY attachments');
      expect(fixture.componentInstance.composer!.files.length).toBe(5);
      send().click();
      await fixture.whenStable();
      const [url, body] = http.post.mock.calls[1];
      expect(url).toContain('/threads/TEST-ATTACHMENT/reply');
      expect((body as FormData).getAll('files')).toHaveLength(5);
      expect(savedAttachments).toHaveLength(5);
      messages = [
        {
          id: 'TEST-MESSAGE',
          message: 'TEST ONLY attachments',
          createdAt: '2026-01-01T00:00:00Z',
          attachments: savedAttachments,
        },
      ];
      retry.next();
      retry.complete();
      await fixture.whenStable();
      expect(host.querySelector('textarea')!.value).toBe('');
      expect(fixture.componentInstance.composer!.files).toEqual([]);
      for (let i = 1; i <= 5; i++) expect(host.textContent).toContain(`TEST-${i}.pdf`);
      expect(host.scrollWidth).toBeLessThanOrEqual(width + 1);
      fixture.destroy();
    });
  }
