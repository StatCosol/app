import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreadMessagePanelComponent } from '../shared/components/thread/thread-message-panel.component';
import { MessageBubbleComponent } from '../shared/thread/components/message-bubble/message-bubble.component';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';

afterEach(() => {
  TestBed.resetTestingModule();
  document.querySelectorAll('[data-download-test]').forEach((n) => n.remove());
});
for (const width of [390, 768, 1440])
  for (const renderer of ['panel', 'bubble']) {
    it(`${renderer} handles attachment download recovery and unavailable files at ${width}px`, async () => {
      await page.viewport(width, 900);
      const pending = new Subject<void>(),
        retry = new Subject<void>();
      const download = vi.fn().mockReturnValueOnce(pending).mockReturnValueOnce(retry);
      const Component = renderer === 'panel' ? ThreadMessagePanelComponent : MessageBubbleComponent;
      await TestBed.configureTestingModule({
        imports: [Component],
        providers: [
          provideZonelessChangeDetection(),
          { provide: ProtectedFileService, useValue: { download } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(Component as typeof ThreadMessagePanelComponent);
      const longName = 'TEST-' + 'long-evidence-name'.repeat(18) + '.pdf';
      const attachments = [
        { name: longName, url: '/TEST-ONLY/file.pdf' },
        { name: 'TEST-unavailable.pdf', url: '' },
      ];
      if (renderer === 'panel')
        fixture.componentRef.setInput('messages', [
          {
            id: 'TEST-MESSAGE',
            body: 'TEST ONLY',
            senderName: 'TEST',
            createdAt: '2026-01-01',
            attachments,
          },
        ]);
      else
        fixture.componentRef.setInput('msg', {
          id: 'TEST-MESSAGE',
          message: 'TEST ONLY',
          senderRole: 'CLIENT',
          createdAt: '2026-01-01',
          attachments,
        });
      const host = document.createElement('main');
      host.className = 'workspace-ui';
      host.setAttribute('data-download-test', '');
      document.body.append(host);
      host.append(fixture.nativeElement);
      fixture.detectChanges();
      await fixture.whenStable();
      const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
      const button = () => buttons().find((b) => b.textContent?.includes(longName))!;
      expect(buttons().find((b) => b.textContent?.includes('TEST-unavailable.pdf'))!.disabled).toBe(
        true,
      );
      button().click();
      await fixture.whenStable();
      expect(button().disabled).toBe(true);
      button().click();
      expect(download).toHaveBeenCalledOnce();
      expect(host.textContent).toContain('Downloading');
      pending.error(new Error('TEST network outage'));
      await fixture.whenStable();
      expect(host.querySelector('[role=alert]')?.textContent).toContain('Try again');
      expect(button().disabled).toBe(false);
      button().click();
      await fixture.whenStable();
      expect(download).toHaveBeenCalledTimes(2);
      expect(host.querySelector('[role=alert]')).toBeNull();
      retry.next();
      retry.complete();
      await fixture.whenStable();
      expect(button().disabled).toBe(false);
      expect(host.scrollWidth).toBeLessThanOrEqual(width + 1);
      fixture.destroy();
    });
  }
