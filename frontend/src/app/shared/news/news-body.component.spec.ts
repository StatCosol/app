import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { NewsBodyComponent } from './news-body.component';

describe('news article content', () => {
  it('exposes the notification URL as a clickable link and preserves its headline', () => {
    const c = new NewsBodyComponent();
    c.body = 'Minimum wage notification 2026\nOfficial notification: https://labour.gujarat.gov.in/wages.pdf';
    expect(c.parts.map(p => p.text).join('')).toContain('Minimum wage notification 2026');
    expect(c.parts.find(p => p.url)?.url).toBe('https://labour.gujarat.gov.in/wages.pdf');
  });
  it('explains legacy notices without inventing the missing notification', () => {
    const c = new NewsBodyComponent();
    c.body = 'An automated compliance monitor detected a new update on Gujarat Labour.\nOfficial source: https://labour.gujarat.gov.in/\nAction: Update payroll';
    expect(c.parts.map(p => p.text).join('')).toContain('No specific notification details were captured');
    expect(c.parts.map(p => p.text).join('')).not.toContain('Update payroll');
    expect(c.parts.find(p => p.url)?.url).toBe('https://labour.gujarat.gov.in/');
  });
  it('keeps markup and unsafe schemes as text', () => {
    const c = new NewsBodyComponent();
    c.body = '<script>alert(1)</script> javascript:alert(1) https://user:pass@example.com';
    expect(c.parts.every(p => !p.url)).toBe(true);
  });
});
