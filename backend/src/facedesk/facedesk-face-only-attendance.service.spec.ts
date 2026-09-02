import { FaceDeskFaceOnlyAttendanceService } from './facedesk-face-only-attendance.service';

/**
 * FACE_ONLY is 1:N: the system decides who someone is rather than confirming a
 * claim. Every test here is about refusing rather than guessing — a wrong answer
 * marks the wrong person present and pays them, and it does so silently.
 */
function makeService(opts: {
  enabled?: boolean;
  identify?: unknown;
  subject?: Record<string, unknown> | null;
} = {}) {
  const azureFace = {
    enabled: opts.enabled ?? true,
    identifyForAttendance: jest.fn().mockResolvedValue(opts.identify ?? null),
  };
  const dataSource = {
    query: jest
      .fn()
      .mockResolvedValue(opts.subject === null ? [] : [opts.subject ?? {
        employeeId: 'e1',
        employeeCode: 'EMP001',
        name: 'Ravi',
        branchId: 'b1',
        subjectType: 'EMPLOYEE',
      }]),
  };
  const failedAttemptService = {
    recordFailed: jest.fn().mockResolvedValue(undefined),
  };
  const punchAcceptService = {
    acceptPunch: jest.fn().mockResolvedValue({ status: 'MARKED' }),
  };
  const service = new FaceDeskFaceOnlyAttendanceService(
    dataSource as any,
    azureFace as any,
    failedAttemptService as any,
    punchAcceptService as any,
  );
  return { service, azureFace, punchAcceptService, failedAttemptService };
}

const dto = { frames: [{ photoB64: 'jpeg' }] } as any;

describe('FaceDeskFaceOnlyAttendanceService', () => {
  it('marks the punch on a clear identification', async () => {
    const { service, punchAcceptService } = makeService({
      identify: { employeeId: 'e1', confidence: 0.91, margin: 0.2 },
    });
    const res = await service.markByFace('c1', 'b1', 'd1', dto, []);

    expect(res).toEqual({ status: 'MARKED' });
    const call = punchAcceptService.acceptPunch.mock.calls[0];
    expect(call[4]).toMatchObject({ employeeId: 'e1', employeeCode: 'EMP001' });
    // Azure's own numbers are recorded, so a punch can be audited on what
    // actually decided it.
    expect(call[5]).toBe(0.91);
    expect(call[6]).toBe(0.2);
  });

  it('refuses when Azure identification is unavailable', async () => {
    // The whole point of the mode: there is no safe local answer to "who is
    // this?", so an outage must stop punches rather than fall back.
    const { service, punchAcceptService, azureFace } = makeService({
      enabled: false,
    });
    const res = await service.markByFace('c1', 'b1', 'd1', dto, []);

    expect(res.status).toBe('REJECTED');
    expect(azureFace.identifyForAttendance).not.toHaveBeenCalled();
    expect(punchAcceptService.acceptPunch).not.toHaveBeenCalled();
  });

  it('refuses when Azure returns no confident match', async () => {
    const { service, punchAcceptService } = makeService({ identify: null });
    const res = await service.markByFace('c1', 'b1', 'd1', dto, []);

    expect(res).toMatchObject({ status: 'REJECTED', message: /not recognised/i });
    expect(punchAcceptService.acceptPunch).not.toHaveBeenCalled();
  });

  it('refuses when the identified profile no longer exists', async () => {
    // Azure can still hold a face whose profile was deleted — an orphan must
    // never resolve to an identity.
    const { service, punchAcceptService } = makeService({
      identify: { employeeId: 'gone', confidence: 0.95, margin: 0.3 },
      subject: null,
    });
    const res = await service.markByFace('c1', 'b1', 'd1', dto, []);

    expect(res.status).toBe('REJECTED');
    expect(punchAcceptService.acceptPunch).not.toHaveBeenCalled();
  });

  it('refuses when the kiosk sent no photo', async () => {
    // Azure identifies from the image; a device embedding is not enough.
    const { service, azureFace } = makeService();
    const res = await service.markByFace('c1', 'b1', 'd1', { frames: [] } as any, []);

    expect(res.status).toBe('REJECTED');
    expect(azureFace.identifyForAttendance).not.toHaveBeenCalled();
  });

  it('records every refusal as a failed attempt', async () => {
    // A face-only kiosk that silently rejects people needs a trail, otherwise
    // "it does not recognise me" is unfalsifiable.
    const { service, failedAttemptService } = makeService({ identify: null });
    await service.markByFace('c1', 'b1', 'd1', dto, []);
    expect(failedAttemptService.recordFailed).toHaveBeenCalled();
  });
});
