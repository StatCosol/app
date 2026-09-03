/**
 * Choose which captured frame's photo to keep.
 *
 * The kiosk sends a burst — up to ATTENDANCE_MAX_FRAMES — and every frame
 * carries both a photo and the quality score the device computed for it. Until
 * this helper existed, all three consumers took the FIRST frame with a photo.
 *
 * That is close to the worst choice available. The capture gates are MINIMUMS,
 * so the first frame to clear them is the instant the worker crossed the
 * threshold: furthest from the camera, least settled, softest. Quality climbs
 * over the burst. Meanwhile the server already ranks frames by quality for
 * MATCHING (FaceDeskFaceService.bestFrames) — so the punch was being decided on
 * the best frames while the photo kept, shown to admins, and sent to Azure for
 * 1:N identification came from near the bottom.
 *
 * It matters most in FACE_ONLY, where that photo is not a record of the punch
 * but the input that decides WHO it belongs to.
 *
 * Ties and missing scores keep insertion order (Array.sort is stable), so a
 * client that sends no qualityScore behaves exactly as it did before.
 */
export interface PickablePhotoFrame {
  photoB64?: string;
  qualityScore?: number;
  sampleType?: 'FRONT' | 'LEFT' | 'RIGHT' | 'EXPRESSION' | 'LIVENESS';
}

/**
 * Highest-scoring photo in `frames`, or null when none carries one.
 *
 * `preferSampleType` restricts the choice to that sample type when at least one
 * such frame has a photo — enrolment wants a front-facing portrait even if a
 * turned head happened to score higher, because the photo is what a human
 * compares faces against in the duplicate-alert queue.
 */
export function pickBestPhoto(
  frames: readonly PickablePhotoFrame[] | undefined | null,
  preferSampleType?: PickablePhotoFrame['sampleType'],
): string | null {
  const withPhotos = (frames ?? []).filter(
    (f): f is PickablePhotoFrame & { photoB64: string } =>
      typeof f?.photoB64 === 'string' && f.photoB64.length > 0,
  );
  if (!withPhotos.length) return null;

  const preferred = preferSampleType
    ? withPhotos.filter((f) => f.sampleType === preferSampleType)
    : [];
  const pool = preferred.length ? preferred : withPhotos;

  // An absent score must never outrank a real one, but must not reorder a
  // batch where nothing is scored either.
  const best = [...pool].sort(
    (a, b) => scoreOf(b) - scoreOf(a),
  )[0];
  return best.photoB64;
}

function scoreOf(frame: PickablePhotoFrame): number {
  return typeof frame.qualityScore === 'number' &&
    Number.isFinite(frame.qualityScore)
    ? frame.qualityScore
    : -1;
}
