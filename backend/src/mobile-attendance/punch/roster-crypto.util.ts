import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Domain separator — kiosk clients must use the same string when deriving keys. */
export const ROSTER_KEY_DOMAIN = 'statcompy-roster-v1';

/** Offline kiosk roster cache lifetime (embeddings are device-bound ciphertext). */
export const ROSTER_EMBEDDING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * AES-256 key derived only from kiosk-held material (device id + bearer install
 * token returned at register). No server secret is required on the device.
 */
export function deriveRosterAesKey(
  deviceId: string,
  installToken: string,
): Buffer {
  return createHash('sha256')
    .update(`${ROSTER_KEY_DOMAIN}:${deviceId}:${installToken}`)
    .digest();
}

export function encryptRosterEmbedding(
  deviceId: string,
  installToken: string,
  plain: Buffer,
): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(
    ALGO,
    deriveRosterAesKey(deviceId, installToken),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptRosterEmbedding(
  deviceId: string,
  installToken: string,
  cipherB64: string,
): Buffer {
  const packed = Buffer.from(cipherB64, 'base64');
  if (packed.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid roster ciphertext');
  }
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(
    ALGO,
    deriveRosterAesKey(deviceId, installToken),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function rosterPlainEmbeddingsAllowed(): boolean {
  return process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS === 'true';
}
