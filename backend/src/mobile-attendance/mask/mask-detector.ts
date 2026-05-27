/**
 * Roadmap #9 / K13: Mask / PPE detection provider abstraction.
 *
 * Same shape as the PAD provider. A real implementation needs a separate
 * model (on-device MediaPipe + tiny classifier, Azure Face mask flag,
 * or a custom model trained on our captured-photo audit corpus). Until
 * one is wired in, the default NoopMaskDetector returns { ok: true } so
 * behaviour is unchanged.
 *
 * Selection is driven by FACE_MASK_DETECTOR (none|onnx|azure). Policy on
 * detection is governed by FACE_MASK_POLICY (allow|warn|block): a
 * provider reporting `masked: true` only rejects the punch when policy
 * is `block`. This split keeps the model decision orthogonal to the
 * enforcement decision.
 */
export interface MaskCheckInput {
  /** Storage URL of the captured frame, if photo audit is enabled. */
  photoUrl?: string | null;
  /** Raw frame bytes if the caller has them in-memory. */
  frameBytes?: Buffer | null;
  /** Provider-specific opaque payload echoed back by the device. */
  providerPayload?: unknown;
}

export type MaskPolicy = 'allow' | 'warn' | 'block';

export function getMaskPolicy(): MaskPolicy {
  const raw = String(process.env.FACE_MASK_POLICY || 'allow').toLowerCase();
  if (raw === 'warn' || raw === 'block') return raw;
  return 'allow';
}

export interface MaskCheckResult {
  /** Whether the punch is allowed to proceed under the current policy. */
  ok: boolean;
  /** Provider identifier (`noop`, `onnx-mask-v1`, ...) for audit. */
  provider: string;
  /** True if the provider believes a face covering is present. */
  masked: boolean;
  /** Provider-reported confidence (0..1) if available. */
  score?: number | null;
  /** Human-readable reason on rejection, surfaced to the client. */
  reason?: string;
}

export interface MaskDetector {
  readonly name: string;
  check(input: MaskCheckInput): Promise<MaskCheckResult>;
}

export const MASK_DETECTOR = Symbol('MASK_DETECTOR');

export class NoopMaskDetector implements MaskDetector {
  readonly name = 'noop';
  async check(_input: MaskCheckInput): Promise<MaskCheckResult> {
    return { ok: true, provider: this.name, masked: false, score: null };
  }
}

export function createMaskDetector(): MaskDetector {
  const choice = String(process.env.FACE_MASK_DETECTOR || 'none').toLowerCase();
  switch (choice) {
    case 'none':
    case '':
      return new NoopMaskDetector();
    // case 'onnx':
    //   return new OnnxMaskDetector();
    // case 'azure':
    //   return new AzureFaceMaskDetector();
    default:
      // Unknown value — fail safe to noop and let ops fix the env var
      // rather than blocking every punch.
      return new NoopMaskDetector();
  }
}
