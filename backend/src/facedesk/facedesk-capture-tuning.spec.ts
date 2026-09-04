import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CaptureTuningDto, UpdateSettingsDto } from './facedesk.dto';
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
      // FaceKioskTuning.MIN_BLUR_* also ship at 0 (gate disabled). If the server
      // defaulted these to anything else, every kiosk that fetches config would
      // start applying a blur floor that no APK build was calibrated against.
      minBlurAttendance: 0,
      minBlurEnrollment: 0,
      minLuminance: 20,
      maxPitchDeg: 28,
      maxYawDeg: 30,
      postPunchHoldMs: 8000,
      blinkAbsThreshold: 0.5,
      blinkDropDelta: 0.25,
      // null = unconfigured, so the handset keeps the size DeviceCameraProfile
      // derived from its own camera. Sending a number here forces every kiosk
      // on the client to that size.
      analysisWidth: null,
      analysisHeight: null,
    });
  });
});

/**
 * The DTO is the only supported way to set this: the global ValidationPipe runs
 * forbidNonWhitelisted, so an undeclared property is a 400 and the value would
 * be unreachable except by editing Postgres directly.
 */
describe('CaptureTuningDto', () => {
  const errorsFor = (payload: unknown) =>
    validateSync(plainToInstance(UpdateSettingsDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('is declared on UpdateSettingsDto, so a write is not rejected outright', () => {
    expect(new UpdateSettingsDto()).toHaveProperty('captureTuning', undefined);
    expect(errorsFor({ captureTuning: { minLuminance: 30 } })).toHaveLength(0);
  });

  it('accepts a partial override', () => {
    expect(errorsFor({ captureTuning: { minSharpnessEnrollment: 55 } }))
      .toHaveLength(0);
  });

  it('rejects an out-of-range value instead of storing it', () => {
    // Reported to the operator rather than silently ignored on read.
    expect(errorsFor({ captureTuning: { minSharpnessAttendance: 0 } }))
      .not.toHaveLength(0);
    expect(errorsFor({ captureTuning: { minFaceSizeAttendance: 1.0 } }))
      .not.toHaveLength(0);
  });

  it('rejects an unknown key inside the tuning object', () => {
    expect(errorsFor({ captureTuning: { nonsense: 1 } })).not.toHaveLength(0);
  });

  it('declares every field resolveCaptureTuning knows about', () => {
    // A field missing here would be silently unsettable through the API.
    const dtoKeys = Object.keys(
      plainToInstance(CaptureTuningDto, {
        minFaceSizeAttendance: 0.2,
        minFaceSizeEnrollment: 0.2,
        minSharpnessAttendance: 40,
        minSharpnessEnrollment: 40,
        minLuminance: 25,
        maxPitchDeg: 30,
        maxYawDeg: 30,
        postPunchHoldMs: 8000,
        blinkAbsThreshold: 0.5,
        blinkDropDelta: 0.3,
        analysisWidth: 1280,
        analysisHeight: 720,
      }),
    ).sort();
    expect(dtoKeys).toEqual(Object.keys(DEFAULT_CAPTURE_TUNING).sort());
  });
});
