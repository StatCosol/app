/**
 * Capture tuning served to kiosk devices.
 *
 * The kiosk APK is universal — one binary, all ABIs, no Build.MODEL branching.
 * But its capture thresholds were compile-time constants profiled on a single
 * handset (SM-E076B: 720p, 8 MP front camera, no flash, MT6835), and they then
 * applied to every device the APK ran on.
 *
 * That is the wrong way round. Gates calibrated to the weakest expected camera
 * are too permissive on a better one — a sharper sensor clears a sharpness floor
 * set for a soft one, so poorer captures than necessary enter the gallery, and
 * the embeddings built from them are what duplicate detection has to work with.
 *
 * These are the values that genuinely vary with hardware: face size (sensor FOV),
 * sharpness (optics), luminance (flash and sensitivity), blink probabilities (how
 * the camera reports eye-open in dim light) and analysis resolution (SoC
 * throughput). Frame counts, timeouts and overlay geometry are flow and layout
 * rather than hardware, so they stay in the app.
 *
 * The defaults below are exactly the constants the APK shipped with, so a client
 * that configures nothing behaves precisely as before.
 */
export interface FaceDeskCaptureTuning {
  minFaceSizeAttendance: number;
  minFaceSizeEnrollment: number;
  minSharpnessAttendance: number;
  minSharpnessEnrollment: number;
  minBlurAttendance: number;
  minBlurEnrollment: number;
  minLuminance: number;
  maxPitchDeg: number;
  maxYawDeg: number;
  /** Milliseconds the kiosk stops capturing after a punch is RECORDED. */
  postPunchHoldMs: number;
  /** Framing: keep the whole face in frame and near the guide oval. */
  faceEdgeMargin: number;
  maxFaceOffsetX: number;
  maxFaceOffsetY: number;
  blinkAbsThreshold: number;
  blinkDropDelta: number;
  /**
   * Null means "not configured — let the device decide".
   *
   * These two are NOT like the thresholds around them. A threshold default is a
   * constant the APK also ships, so sending it is a genuine no-op. The APK's
   * resolution default is not a constant any more: DeviceCameraProfile derives
   * it from the handset's own camera at bind time. Sending 1280x720 here
   * therefore did not mean "unconfigured", it meant "force 720p" — and because
   * this object is always fully populated, EVERY kiosk was overridden back to
   * 720p the moment it fetched config, silently discarding the device profile.
   */
  analysisWidth: number | null;
  analysisHeight: number | null;
}

/** The SM-E076B profile the APK has always used. */
export const DEFAULT_CAPTURE_TUNING: FaceDeskCaptureTuning = {
  minFaceSizeAttendance: 0.12,
  minFaceSizeEnrollment: 0.13,
  minSharpnessAttendance: 38,
  minSharpnessEnrollment: 42,
  // 0 = gate disabled. New scale (Laplacian variance / contrast), no field data
  // yet to set a floor from — see FaceCaptureSession.computeBlurScore.
  minBlurAttendance: 0,
  minBlurEnrollment: 0,
  minLuminance: 20,
  maxPitchDeg: 28,
  // Yaw was ungated until a side-on face was seen punching successfully.
  maxYawDeg: 30,
  // 3 s let the same worker be captured twice before stepping away, which
  // registers them OUT the moment they arrive.
  postPunchHoldMs: 8000,
  // Nothing checked WHERE the face was, so half-out-of-frame and off-to-one-side
  // captures punched normally. 0 disables any of the three.
  faceEdgeMargin: 0.02,
  maxFaceOffsetX: 0.28,
  maxFaceOffsetY: 0.32,
  blinkAbsThreshold: 0.5,
  blinkDropDelta: 0.25,
  // Deliberately null — see the interface. The device picks unless an operator
  // has explicitly pinned a size for this client.
  analysisWidth: null,
  analysisHeight: null,
};

/**
 * Bounds for each value. A tuning row is operator-supplied, and these numbers
 * gate biometric capture: a zeroed sharpness floor would accept anything, and a
 * face-size of 1.0 would accept nothing and silently break every kiosk on that
 * client. Out-of-range values fall back to the default rather than being clamped
 * silently to an edge, so a typo behaves like "not configured" instead of like a
 * deliberate extreme.
 */
const RANGES: Record<keyof FaceDeskCaptureTuning, [number, number]> = {
  minFaceSizeAttendance: [0.05, 0.6],
  minFaceSizeEnrollment: [0.05, 0.6],
  minSharpnessAttendance: [5, 200],
  minSharpnessEnrollment: [5, 200],
  // 0 is a legitimate value here, unlike the sharpness floors: it means the
  // gate is off, which is the current default.
  minBlurAttendance: [0, 50],
  minBlurEnrollment: [0, 50],
  minLuminance: [1, 200],
  maxPitchDeg: [5, 60],
  maxYawDeg: [5, 60],
  // Floor of 2 s, not 0: a zero hold is the bug this exists to prevent, and an
  // out-of-range value falls back to the default rather than disabling it.
  postPunchHoldMs: [2000, 120000],
  // 0 = off. Upper bounds keep a typo from disabling framing entirely: an
  // offset of 1.0 would accept a face anywhere in the frame.
  faceEdgeMargin: [0, 0.2],
  maxFaceOffsetX: [0, 0.5],
  maxFaceOffsetY: [0, 0.5],
  blinkAbsThreshold: [0.1, 0.95],
  blinkDropDelta: [0.05, 0.9],
  analysisWidth: [320, 3840],
  analysisHeight: [240, 2160],
};

/**
 * Merge a stored tuning row over the defaults, dropping anything unusable.
 *
 * Accepts null/undefined (nothing configured), a partial object (configure one
 * value, inherit the rest) and junk (a bad row must not stop a kiosk booting).
 */
export function resolveCaptureTuning(
  stored: unknown,
): FaceDeskCaptureTuning {
  const out: FaceDeskCaptureTuning = { ...DEFAULT_CAPTURE_TUNING };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;

  for (const key of Object.keys(RANGES) as Array<keyof FaceDeskCaptureTuning>) {
    const raw = (stored as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const [min, max] = RANGES[key];
    if (value < min || value > max) continue;
    (out as unknown as Record<string, number | null>)[key] = value;
  }
  return out;
}
