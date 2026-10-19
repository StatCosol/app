import sanitizeHtml from 'sanitize-html';
import { createHash } from 'crypto';

export interface ComplianceNotification {
  title: string;
  url: string;
  hash: string;
}

/** Preserve source headlines and links; never infer legal changes from page hashes. */
export function extractComplianceNotifications(
  html: string,
  sourceUrl: string,
): ComplianceNotification[] {
  const source = new URL(sourceUrl);
  const items = new Map<string, ComplianceNotification>();
  const rows: Array<{ cells: string[]; links: string[] }> = [];
  function add(title: string, href: string, tableNotice = false) {
    title = title.replace(/\s+/g, ' ').trim();
    if (title.length < 20 || title.length > 500) return;
    if (/^(please refer|click here|read more|download)/i.test(title)) return;
    if (
      !tableNotice &&
      !/\b(notification|circular|order|wages?|revision|revised|amendment|extension|deadline|contribution|compliance|labou?r|epfo?|esic?|fssai|act|rules?|industrial|harassment|provident|pension|gratuity)\b/i.test(
        title,
      )
    )
      return;
    try {
      const url = new URL(href, source);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return;
      if (
        url.hostname !== source.hostname &&
        !/\.(gov|nic)\.in$/i.test(url.hostname)
      )
        return;
      url.hash = '';
      if (url.href === source.href || url.pathname === '/') return;
      if (
        !/\.pdf$/i.test(url.pathname) &&
        (tableNotice || !/\b\d{2,4}\b/.test(title))
      )
        return;
      const hash = createHash('sha256')
        .update(url.href + '\n' + title)
        .digest('hex');
      items.set(hash, { title, url: url.href, hash });
    } catch {
      /* Ignore malformed source links. */
    }
  }
  sanitizeHtml(html, {
    allowedTags: ['a', 'tr', 'td'],
    allowedAttributes: { a: ['href'] },
    nonTextTags: [
      'script',
      'style',
      'textarea',
      'noscript',
      'nav',
      'header',
      'footer',
    ],
    transformTags: {
      tr: (tagName, attribs) => {
        rows.push({ cells: [], links: [] });
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) => {
      const row = rows[rows.length - 1];
      if (frame.tag === 'a' && frame.attribs.href) {
        const title = frame.text.replace(/\s+/g, ' ').trim();
        if (
          row &&
          (!title || /^(download|view|pdf|english|gujarati)$/i.test(title))
        )
          row.links.push(frame.attribs.href);
        else add(title, frame.attribs.href);
      }
      if (frame.tag === 'td' && row)
        row.cells.push(frame.text.replace(/\s+/g, ' ').trim());
      if (frame.tag === 'tr' && row) {
        rows.pop();
        // Serial numbers change whenever a new row is inserted. Exclude them
        // and file sizes from identity, while retaining dates and source text.
        const cells = row.cells.filter(
          (text) =>
            text &&
            !/^\d+$/.test(text) &&
            !/^\(?[\d.]+\s*(KB|MB)\)?$/i.test(text) &&
            !/^(download|view|pdf|english|gujarati)$/i.test(text),
        );
        const title = cells.join(' | ');
        if (
          cells.length >= 2 &&
          /\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/.test(title)
        ) {
          for (const href of row.links) add(title, href, true);
        }
      }
      return false;
    },
  });
  return [...items.values()];
}
