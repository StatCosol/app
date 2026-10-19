import { extractComplianceNotifications as extract } from './compliance-news-extractor';
const source = 'https://labour.gujarat.gov.in/';
describe('official notification extraction', () => {
  it('captures the actual headline and resolved official link once', () => {
    const html =
      '<a href="/docs/wages.pdf">Minimum <b>wage</b> revision &amp; allowances 2026</a>';
    const items = extract(html + html, source);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Minimum wage revision & allowances 2026',
      url: source + 'docs/wages.pdf',
    });
  });
  it('ignores page text, generic links and untrusted destinations', () => {
    const html =
      '<p>Labour notifications. Visitor count: 12345</p>' +
      '<a href="/notifications">Labour notifications and circulars</a>' +
      '<a href="/circular.pdf">Please refer the Department circular for information</a>' +
      '<a href="https://untrusted.example/order.pdf">New minimum wage order 2026</a>' +
      '<a href="javascript:alert(1)">New minimum wage order 2026</a>' +
      '<a href="https://user:pass@labour.gujarat.gov.in/order.pdf">New minimum wage order 2026</a>' +
      '<nav><a href="/archive.pdf">Labour notification archive 2026</a></nav>';
    expect(extract(html, source)).toEqual([]);
  });
  it('keeps identity stable across layout changes and detects a revised title', () => {
    const old = extract(
      '<a href="/notice/123">Wage notification 123 of 2026</a>',
      source,
    )[0];
    expect(
      extract(
        '<p>Visitors 999</p><a href="/notice/123">Wage   notification 123 of 2026</a>',
        source,
      )[0].hash,
    ).toBe(old.hash);
    expect(
      extract(
        '<a href="/notice/123">Revised wage notification 123 of 2026</a>',
        source,
      )[0].hash,
    ).not.toBe(old.hash);
  });
  it('captures regional-language rows with icon-only links without serial-number duplicates', () => {
    const title =
      '\u0ab6\u0acd\u0ab0\u0aae \u0ab5\u0abf\u0aad\u0abe\u0a97\u0aa8\u0ac0 \u0ab8\u0ac2\u0a9a\u0aa8\u0abe';
    const row = (number: number) =>
      `<table><tr><td>${number}</td><td>08/10/2026</td><td>LED/2026/123</td><td>${title}</td><td><a href="/notice.pdf"><img src="pdf.png"></a> (504 KB)</td></tr></table>`;
    const items = extract(row(1), source);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain(title);
    expect(items[0].title).toContain('08/10/2026');
    expect(extract(row(2), source)[0].hash).toBe(items[0].hash);
  });
});
