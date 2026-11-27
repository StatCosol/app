import {
  digestDate,
  digestReady,
  digestRecipients,
  digestEventKey,
  renderDigest,
  DigestInput,
} from './notification-digest';
const input: DigestInput = {
  to: 'one@example.invalid',
  category: 'Audit',
  subject: 'Task 1',
  title: 'Overdue',
  bodyHtml: '<p>Task evidence</p>',
};
describe('Recipient notification summaries', () => {
  it.each([
    ['2026-11-27T18:29:59Z', '2026-11-28', true],
    ['2026-11-27T18:30:00Z', '2026-11-28', false],
    ['2026-11-28T04:59:59Z', '2026-11-28', false],
    ['2026-11-28T05:00:00Z', '2026-11-29', true],
    ['2026-12-31T05:00:00Z', '2027-01-01', true],
  ])('uses the IST cutoff for %s', (at, date, ready) => {
    expect(digestDate(new Date(at))).toBe(date);
    expect(digestReady(new Date(at))).toBe(ready);
  });
  it('normalizes overlapping To, Cc and Bcc without exposing address placement', () => {
    expect(
      digestRecipients({
        ...input,
        to: ['One <ONE@example.invalid>', 'two@example.invalid'],
        cc: 'one@example.invalid',
        bcc: 'Hidden <secret@example.invalid>',
      }),
    ).toEqual([
      'one@example.invalid',
      'secret@example.invalid',
      'two@example.invalid',
    ]);
  });
  it.each([
    '',
    'invalid',
    'x@',
    'bad@example.invalid\nBcc: attacker@example.invalid',
  ])('rejects invalid recipients %s', (to) => {
    expect(() => digestRecipients({ ...input, to })).toThrow();
  });
  it('deduplicates identical events independently of recipient order', () => {
    expect(digestEventKey(input, '2026-11-28')).toBe(
      digestEventKey({ ...input, to: 'other@example.invalid' }, '2026-11-28'),
    );
    expect(digestEventKey(input, '2026-11-28')).not.toBe(
      digestEventKey(input, '2026-11-29'),
    );
    expect(digestEventKey(input, '2026-11-28')).not.toBe(
      digestEventKey({ ...input, bodyHtml: 'changed' }, '2026-11-28'),
    );
  });
  it('includes all 130 overdue tasks and escapes untrusted headings', () => {
    const items = Array.from({ length: 130 }, (_, i) => ({
      id: String(i),
      category: 'Audit',
      subject: 'Task ' + i,
      title: 'Title',
      body_html: '<p>Evidence ' + i + '</p>',
    }));
    items[0].subject = '<script>bad</script>';
    const body = renderDigest(items, '2026-11-28');
    expect(body.match(/<section/g)).toHaveLength(130);
    expect(body).toContain('Evidence 129');
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>');
    expect(body).not.toContain(input.to);
  });
});
