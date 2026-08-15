/**
 * Public-facing base URL of the app portal, used to build links placed in
 * outbound client emails/notifications.
 *
 * Resolved from FRONTEND_URL — the app's canonical public base, which is
 * validated and always populated by ConfigModule (the real host in production,
 * e.g. https://app.statcosol.com; http://localhost:4200 in development). This
 * mirrors how the rest of the app builds links (auth, compliance crons) so the
 * domain can be changed via configuration alone — no code edits.
 *
 * Note: we intentionally do NOT chain `process.env.FRONTEND_URL || <other>`.
 * ConfigModule assigns FRONTEND_URL's validated default back into process.env,
 * so it is always truthy — any secondary env var or literal after it would be
 * dead code that never runs. The literal below is a defensive fallback only for
 * contexts where ConfigModule has not run (e.g. standalone scripts).
 */
export function portalBaseUrl(): string {
  const base = process.env.FRONTEND_URL || 'https://app.statcosol.com';
  return base.replace(/\/$/, '');
}

/** Join a path onto the portal base URL (leading slash optional). */
export function portalUrl(path: string): string {
  const base = portalBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
