import {
  decryptRosterEmbedding,
  encryptRosterEmbedding,
} from './roster-crypto.util';

describe('roster-crypto.util', () => {
  const deviceId = 'device-abc';
  const installToken = 'install-token-xyz';
  const plain = Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer);

  it('round-trips embedding bytes with device-bound AES-GCM', () => {
    const cipherB64 = encryptRosterEmbedding(deviceId, installToken, plain);
    const decoded = decryptRosterEmbedding(deviceId, installToken, cipherB64);
    expect(Buffer.compare(decoded, plain)).toBe(0);
  });

  it('rejects ciphertext decrypted with a different device token', () => {
    const cipherB64 = encryptRosterEmbedding(deviceId, installToken, plain);
    expect(() =>
      decryptRosterEmbedding(deviceId, 'other-token', cipherB64),
    ).toThrow();
  });
});
