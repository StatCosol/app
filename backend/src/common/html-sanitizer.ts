import sanitizeHtml from 'sanitize-html';

/**
 * Allow-list profile for admin-authored HTML (e.g. mail templates) that will
 * later be rendered into an email and/or inserted into the Angular admin UI
 * via `[innerHTML]`. Even though the authors are trusted ADMIN/CEO/CCO users,
 * a compromised admin account or an XSS in a third-party tool would otherwise
 * persist stored-XSS payloads that fire when another admin opens the preview.
 *
 * The placeholder tokens used by ClientCommTemplatesService (e.g.
 * `{{clientName}}`) survive because sanitize-html treats them as text.
 */
const MAIL_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a',
    'b',
    'br',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
    'code',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['style', 'class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
};

/**
 * Sanitize an HTML fragment intended for use in a mail template body.
 * Strips `<script>`, `on*` handlers, `javascript:` URLs, and any tag not in
 * the allow-list. Returns the empty string when input is falsy.
 */
export function sanitizeMailHtml(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeHtml(input, MAIL_HTML_OPTIONS);
}
