import { sanitizeMailHtml } from './html-sanitizer';

/**
 * sanitizeMailHtml() strips stored-XSS vectors from admin-authored mail HTML
 * while keeping the allow-listed formatting tags and template placeholders.
 */
describe('sanitizeMailHtml', () => {
  it('returns an empty string for falsy input', () => {
    expect(sanitizeMailHtml('')).toBe('');
    expect(sanitizeMailHtml(null)).toBe('');
    expect(sanitizeMailHtml(undefined)).toBe('');
  });

  it('removes <script> tags but keeps surrounding text', () => {
    const out = sanitizeMailHtml('<script>alert(1)</script>Hello');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('Hello');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeMailHtml('<div onclick="steal()">hi</div>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain('hi');
  });

  it('strips javascript: URLs on links', () => {
    const out = sanitizeMailHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('keeps allow-listed formatting tags', () => {
    expect(sanitizeMailHtml('<b>bold</b>')).toContain('<b>bold</b>');
  });

  it('adds rel="noopener noreferrer" to anchors', () => {
    const out = sanitizeMailHtml('<a href="https://example.com">y</a>');
    expect(out).toContain('noopener');
  });

  it('preserves template placeholder tokens', () => {
    expect(sanitizeMailHtml('Hello {{clientName}}')).toContain(
      '{{clientName}}',
    );
  });
});
