import { createHash } from 'node:crypto';
import addressparser from 'nodemailer/lib/addressparser';
import { operationalDate } from '../common/operational-date';

export interface DigestInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  category: string;
  subject: string;
  title: string;
  bodyHtml: string;
}
export interface DigestItem {
  id: string;
  category: string;
  subject: string;
  title: string;
  body_html: string;
}
export function digestDate(now: Date): string {
  const today = operationalDate(now);
  const cutoff = new Date(`${today}T10:30:00+05:30`);
  return now < cutoff
    ? today
    : operationalDate(new Date(cutoff.getTime() + 24 * 60 * 60 * 1000));
}
export function digestReady(now: Date): boolean {
  return now >= new Date(`${operationalDate(now)}T10:30:00+05:30`);
}
export function digestRecipients(input: DigestInput): string[] {
  const raw = [input.to, input.cc, input.bcc]
    .flat()
    .filter(Boolean) as string[];
  const result = new Set<string>();
  for (const value of raw) {
    if (/[\r\n]/.test(value)) throw new Error('Invalid notification recipient');
    for (const parsed of addressparser(value, { flatten: true })) {
      const address = parsed.address?.trim().toLowerCase();
      if (!address || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address))
        throw new Error('Invalid notification recipient');
      result.add(address);
    }
  }
  if (!result.size) throw new Error('Notification has no recipients');
  return [...result].sort();
}
export function digestEventKey(
  input: DigestInput,
  availableOn: string,
): string {
  // Independent of address order and To/Cc/Bcc placement. Recipient membership
  // is recorded separately, without leaking other addresses into the digest.
  return createHash('sha256')
    .update(
      JSON.stringify([
        availableOn,
        input.category,
        input.subject.trim(),
        input.title.trim(),
        input.bodyHtml.trim(),
      ]),
    )
    .digest('hex');
}
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function renderDigest(items: DigestItem[], day: string): string {
  // Include every queued item; never silently truncate a large recipient list.
  return (
    `<p>Your complete notification summary for ${escapeHtml(day)} contains <strong>${items.length}</strong> updates.</p>` +
    `<ol>${items.map((item, index) => `<li><a href="#update-${index + 1}">${escapeHtml(item.subject)}</a></li>`).join('')}</ol>` +
    items
      .map(
        (item, index) =>
          `<section id="update-${index + 1}" style="border-top:1px solid #d9e3dd;padding:16px 0"><p style="color:#5a7067">${escapeHtml(item.category)}</p><h2>${escapeHtml(item.subject)}</h2>${item.body_html}</section>`,
      )
      .join('')
  );
}
