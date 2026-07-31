import { DeviceLivenessProvider } from './facedesk-liveness.provider';

describe('DeviceLivenessProvider', () => {
  const withEnv = async (
    env: Record<string, string | undefined>,
    fn: (p: DeviceLivenessProvider) => Promise<void>,
  ) => {
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      await fn(new DeviceLivenessProvider());
    } finally {
      process.env = prev;
    }
  };

  it('passes on the client blink flag alone by default', async () => {
    await withEnv({ FD_REQUIRE_SERVER_LIVENESS: undefined }, async (p) => {
      const r = await p.evaluate({ clientAsserted: true, serverScores: [] });
      expect(r.passed).toBe(true);
      expect(r.provider).toBe('device');
    });
  });

  it('passes on a server score even without the client flag', async () => {
    await withEnv({ FD_REQUIRE_SERVER_LIVENESS: 'false' }, async (p) => {
      const r = await p.evaluate({
        clientAsserted: false,
        serverScores: [0.2, 0.7],
      });
      expect(r.passed).toBe(true);
      expect(r.score).toBe(0.7);
    });
  });

  it('ignores the client flag when server liveness is required', async () => {
    await withEnv({ FD_REQUIRE_SERVER_LIVENESS: 'true' }, async (p) => {
      const asserted = await p.evaluate({
        clientAsserted: true,
        serverScores: [null],
      });
      expect(asserted.passed).toBe(false); // no server score → fails

      const scored = await p.evaluate({
        clientAsserted: false,
        serverScores: [0.9],
      });
      expect(scored.passed).toBe(true);
    });
  });
});
