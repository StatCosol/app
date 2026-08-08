import {
  decryptRosterEmbedding,
  encryptRosterEmbedding,
  deriveRosterAesKey,
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

  it('rejects ciphertext decrypted with a different device id', () => {
    const cipherB64 = encryptRosterEmbedding(deviceId, installToken, plain);
    expect(() =>
      decryptRosterEmbedding('other-device', installToken, cipherB64),
    ).toThrow();
  });

  it('deriveRosterAesKey uses only device id and install token', () => {
    const a = deriveRosterAesKey(deviceId, installToken);
    const b = deriveRosterAesKey(deviceId, installToken);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
    // Cross-platform vector for Android RosterCrypto.kt (SHA-256 hex)
    expect(a.toString('hex')).toBe(
      'aaddce422deade191b890996803d917d482ed1ca7537a4950c328b10c3e80c73',
    );
  });
});
