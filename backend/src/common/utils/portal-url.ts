/**
 * Public-facing base URL of the app portal, used to build links placed in
 * outbound client emails/notifications.
 *
 * Resolved from env (FRONTEND_URL, then PUBLIC_BASE_URL) and only falls back to
 * the current production host. Kept in one place so the domain can be changed
 * via configuration alone — no code edits — if/when the portal is rebranded.
 */
export function portalBaseUrl(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_BASE_URL ||
    'https://statcompy.statcosol.com'
  ).replace(/\/$/, '');
}

/** Join a path onto the portal base URL (leading slash optional). */
export function portalUrl(path: string): string {
  const base = portalBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
