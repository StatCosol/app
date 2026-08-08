import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Offline kiosk roster cache lifetime (embeddings are device-bound ciphertext). */
export const ROSTER_EMBEDDING_TTL_MS = 24 * 60 * 60 * 1000;

function rosterSecret(): string {
  const secret =
    process.env.MOBILE_ROSTER_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';
  if (!secret) {
    const env = (process.env.NODE_ENV ?? '').toLowerCase();
    if (env === 'production' || env === 'prod') {
      throw new Error(
        'MOBILE_ROSTER_SECRET (or JWT_SECRET) must be set in production',
      );
    }
    return 'mobile-roster-dev-only';
  }
  return secret;
}

function rosterKey(deviceId: string, installToken: string): Buffer {
  return createHash('sha256')
    .update(`${rosterSecret()}:${deviceId}:${installToken}`)
    .digest();
}

export function encryptRosterEmbedding(
  deviceId: string,
  installToken: string,
  plain: Buffer,
): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, rosterKey(deviceId, installToken), iv);
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
  const decipher = createDecipheriv(ALGO, rosterKey(deviceId, installToken), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function rosterPlainEmbeddingsAllowed(): boolean {
  return process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS === 'true';
}
