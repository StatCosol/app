import { createHmac } from 'crypto';

/**
 * Deterministic keyed lookup hash for an attendance PIN, scoped to the client.
 *
 * bcrypt PIN hashes are unsearchable, so this stable HMAC is what the unique
 * index enforces "no duplicate PINs" on, and what lets the kiosk resolve a
 * PIN-only punch by an indexed lookup rather than scanning the branch roster.
 * HMAC (not a bare hash) so a DB reader can't enumerate the tiny 4-digit space
 * by precomputing hashes; resolution/uniqueness only need it to be stable.
 */
function pinSecret(): string {
  const secret =
    process.env.FACEDESK_PIN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';
  if (!secret) {
    const env = (process.env.NODE_ENV ?? '').toLowerCase();
    if (env === 'production' || env === 'prod') {
      throw new Error(
        'FACEDESK_PIN_SECRET (or JWT_SECRET) must be set in production',
      );
    }
    return 'facedesk-pin-dev-only';
  }
  return secret;
}

export function pinLookupHash(clientId: string, pin: string): string {
  return createHmac('sha256', pinSecret())
    .update(`${clientId}:${pin}`)
    .digest('hex');
}
