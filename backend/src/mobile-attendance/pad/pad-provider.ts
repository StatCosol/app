/**
 * Roadmap #11 / K11: Presentation-Attack Detection (anti-spoof) provider
 * abstraction.
 *
 * The actual evaluator is pluggable so we can swap between Azure Face
 * Liveness, FaceTec, or a DIY heuristic without touching the punch flow.
 * Selection is driven by FACE_ANTISPOOF_PROVIDER (none|azure|facetec).
 * Until a real provider is wired in, the default NoopPadProvider returns
 * { ok: true } so behaviour is unchanged.
 *
 * Inputs are intentionally minimal — provider implementations can ignore
 * fields they don't need. Add new optional fields here as new providers
 * arrive; do NOT make them required without a migration plan.
 */
export interface PadCheckInput {
  /** Passive liveness score the device computed (0..1). */
  livenessScore?: number | null;
  /** Cosine match score against the enrollment (0..1). */
  matchScore?: number | null;
  /** Base64-encoded probe embedding (mobilefacenet, 192d). */
  probeEmbeddingB64?: string | null;
  /** Storage URL of the captured frame, if photo audit is enabled. */
  photoUrl?: string | null;
  /** Provider-specific opaque payload echoed back by the device. */
  providerPayload?: unknown;
}

export interface PadCheckResult {
  /** Whether the punch is allowed to proceed. */
  ok: boolean;
  /** Provider identifier (`noop`, `azure-face-liveness`, ...) for audit. */
  provider: string;
  /** Provider-reported PAD confidence (0..1) if available. */
  score?: number | null;
  /** Human-readable reason on rejection, surfaced to the client. */
  reason?: string;
}

export interface PadProvider {
  readonly name: string;
  check(input: PadCheckInput): Promise<PadCheckResult>;
}

export const PAD_PROVIDER = Symbol('PAD_PROVIDER');

export class NoopPadProvider implements PadProvider {
  readonly name = 'noop';
  async check(_input: PadCheckInput): Promise<PadCheckResult> {
    return { ok: true, provider: this.name, score: null };
  }
}

/**
 * Factory consulted by the module to materialize the configured provider.
 * Returns NoopPadProvider unless FACE_ANTISPOOF_PROVIDER picks something
 * else AND that implementation has been added. Centralizing the switch
 * here keeps mobile-attendance.module.ts boring.
 */
export function createPadProvider(): PadProvider {
  const choice = String(
    process.env.FACE_ANTISPOOF_PROVIDER || 'none',
  ).toLowerCase();
  switch (choice) {
    case 'none':
    case '':
      return new NoopPadProvider();
    // case 'azure':
    //   return new AzureFaceLivenessPadProvider();
    // case 'facetec':
    //   return new FaceTecPadProvider();
    default:
      // Unknown value — fail safe to noop and let ops fix the env var,
      // rather than blocking every punch with an opaque error.
      return new NoopPadProvider();
  }
}
