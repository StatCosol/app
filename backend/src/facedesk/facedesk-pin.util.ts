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
export function pinLookupHash(clientId: string, pin: string): string {
  const secret =
    process.env.FACEDESK_PIN_SECRET ??
    process.env.JWT_SECRET ??
    'facedesk-pin';
  return createHmac('sha256', secret)
    .update(`${clientId}:${pin}`)
    .digest('hex');
}
