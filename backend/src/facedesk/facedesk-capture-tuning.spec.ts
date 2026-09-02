import {
  DEFAULT_CAPTURE_TUNING,
  resolveCaptureTuning,
} from './facedesk-capture-tuning';

describe('resolveCaptureTuning', () => {
  it('returns the app defaults when nothing is configured', () => {
    // A client that configures nothing must behave exactly as the APK always
    // has — that is what makes this change a no-op until someone opts in.
    expect(resolveCaptureTuning(null)).toEqual(DEFAULT_CAPTURE_TUNING);
    expect(resolveCaptureTuning(undefined)).toEqual(DEFAULT_CAPTURE_TUNING);
  });

  it('applies a partial override and inherits the rest', () => {
    const out = resolveCaptureTuning({ minSharpnessEnrollment: 60 });
    expect(out.minSharpnessEnrollment).toBe(60);
    expect(out.minLuminance).toBe(DEFAULT_CAPTURE_TUNING.minLuminance);
  });

  it('coerces numeric strings, which is what a JSON form tends to send', () => {
    expect(resolveCaptureTuning({ minLuminance: '35' }).minLuminance).toBe(35);
  });

  it('ignores a value outside its range rather than clamping it', () => {
    // Clamping a typo to an edge would look deliberate. Falling back to the
    // default makes a bad entry behave like "not configured".
    expect(resolveCaptureTuning({ minSharpnessAttendance: 0 }))
      .toMatchObject({
        minSharpnessAttendance: DEFAULT_CAPTURE_TUNING.minSharpnessAttendance,
      });
    expect(resolveCaptureTuning({ minFaceSizeAttendance: 1.0 }))
      .toMatchObject({
        minFaceSizeAttendance: DEFAULT_CAPTURE_TUNING.minFaceSizeAttendance,
      });
  });

  it('never lets a bad row stop a kiosk configuring itself', () => {
    // These gate biometric capture; a malformed row must degrade to defaults,
    // not throw on the device-config request.
    for (const junk of ['nonsense', 42, [], { minLuminance: 'abc' }, {}]) {
      expect(resolveCaptureTuning(junk)).toEqual(DEFAULT_CAPTURE_TUNING);
    }
  });

  it('ignores unknown keys instead of passing them through', () => {
    const out = resolveCaptureTuning({ somethingElse: 9, minLuminance: 30 });
    expect(out).not.toHaveProperty('somethingElse');
    expect(out.minLuminance).toBe(30);
  });

  it('does not mutate the shared defaults', () => {
    const before = { ...DEFAULT_CAPTURE_TUNING };
    resolveCaptureTuning({ minLuminance: 99 });
    expect(DEFAULT_CAPTURE_TUNING).toEqual(before);
  });

  it('matches the constants the APK ships, so config is a true no-op', () => {
    // If these drift apart, a device that fetches config would silently start
    // behaving differently from one that fell back to its built-ins.
    expect(DEFAULT_CAPTURE_TUNING).toEqual({
      minFaceSizeAttendance: 0.12,
      minFaceSizeEnrollment: 0.13,
      minSharpnessAttendance: 38,
      minSharpnessEnrollment: 42,
      minLuminance: 20,
      maxPitchDeg: 28,
      blinkAbsThreshold: 0.5,
      blinkDropDelta: 0.25,
      analysisWidth: 1280,
      analysisHeight: 720,
    });
  });
});
