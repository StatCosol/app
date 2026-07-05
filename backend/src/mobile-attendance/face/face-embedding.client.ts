import { Injectable, Logger } from '@nestjs/common';

export interface EmbeddingQuality {
  faceScore: number;
  facePx: number;
  brightness: number;
  sharpness: number;
  ok: boolean;
  reasons: string[];
}

export interface EmbeddingResult {
  /** Raw little-endian float32 base64 — same wire format the kiosk app uses. */
  embeddingB64: string;
  embedding: number[];
  model: string;
  qualityScore: number;
  quality: EmbeddingQuality | null;
  /** P(real face) from the passive anti-spoof model, when face-svc has one. */
  livenessScore: number | null;
}

export class FaceQualityError extends Error {
  constructor(public readonly quality: EmbeddingQuality | null) {
    super(
      quality && quality.reasons.length
        ? `Face capture quality too low: ${quality.reasons.join(', ')}`
        : 'Face capture quality too low',
    );
  }
}

/**
 * HTTP client for the optional external face-svc microservice.
 * Only active when FACE_SVC_URL environment variable is set.
 */
@Injectable()
export class FaceEmbeddingClient {
  private readonly logger = new Logger(FaceEmbeddingClient.name);
  private readonly baseUrl: string | undefined = process.env.FACE_SVC_URL;
  private readonly apiKey: string | undefined = process.env.FACE_SVC_API_KEY;

  get enabled(): boolean {
    return !!this.baseUrl;
  }

  /**
   * Whether to allow graceful degradation when face-svc is unreachable.
   * Set FACE_SVC_ALLOW_FALLBACK=true to allow enrollment/punch without
   * the quality gate when face-svc is down. Defaults to false (strict mode).
   */
  get allowFallback(): boolean {
    return process.env.FACE_SVC_ALLOW_FALLBACK === 'true';
  }

  /**
   * Send a base64 photo to face-svc and get back an embedding + quality
   * + optional passive liveness score.
   *
   * Throws FaceQualityError when face-svc rejects the capture as low
   * quality (too dark / blurry / face too small) so callers can surface
   * the reasons to the kiosk operator.
   *
   * If face-svc is unreachable and allowFallback is true, returns null
   * instead of throwing so callers can skip the quality gate gracefully.
   */
  async extractEmbedding(photoB64: string): Promise<EmbeddingResult | null> {
    if (!this.baseUrl) {
      throw new Error('FACE_SVC_URL is not configured');
    }

    const url = `${this.baseUrl}/embed`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-Face-Svc-Key': this.apiKey } : {}),
        },
        body: JSON.stringify({ photoBase64: photoB64 }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        embeddingBase64?: string;
        embedding?: number[];
        faceScore?: number;
        embeddingModel?: string;
        quality?: EmbeddingQuality;
        livenessScore?: number | null;
        error?: string;
        // legacy field names kept for older face-svc images
        model?: string;
        quality_score?: number;
      } | null;

      if (!resp.ok || !data?.ok) {
        if (data?.error === 'low_quality') {
          throw new FaceQualityError(data.quality ?? null);
        }
        this.logger.error(
          `face-svc error ${resp.status}: ${data?.error ?? 'unknown'}`,
        );
        if (this.allowFallback) {
          this.logger.warn(
            'face-svc unavailable — skipping quality gate (fallback mode)',
          );
          return null;
        }
        throw new Error(`face-svc returned ${resp.status}`);
      }

      const embedding =
        data.embedding ??
        (data.embeddingBase64
          ? Array.from(
              new Float32Array(
                Uint8Array.from(Buffer.from(data.embeddingBase64, 'base64'))
                  .buffer,
              ),
            )
          : []);

      return {
        embeddingB64:
          data.embeddingBase64 ??
          Buffer.from(new Float32Array(embedding).buffer).toString('base64'),
        embedding,
        model: data.embeddingModel ?? data.model ?? 'unknown',
        qualityScore:
          data.quality?.faceScore ?? data.faceScore ?? data.quality_score ?? 0,
        quality: data.quality ?? null,
        livenessScore: data.livenessScore ?? null,
      };
    } catch (err) {
      if (err instanceof FaceQualityError) throw err;
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.logger.error('face-svc request timed out');
      }
      if (this.allowFallback) {
        this.logger.warn(
          'face-svc unavailable — skipping quality gate (fallback mode)',
        );
        return null;
      }
      throw err;
    }
  }
}
