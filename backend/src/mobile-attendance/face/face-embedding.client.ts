import { Injectable, Logger } from '@nestjs/common';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  qualityScore: number;
}

/**
 * HTTP client for the optional external face-svc microservice.
 * Only active when FACE_SVC_URL environment variable is set.
 */
@Injectable()
export class FaceEmbeddingClient {
  private readonly logger = new Logger(FaceEmbeddingClient.name);
  private readonly baseUrl: string | undefined = process.env.FACE_SVC_URL;

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
   * Send a base64 photo to face-svc and get back an embedding + quality score.
   * If face-svc is unreachable and allowFallback is true, returns null instead
   * of throwing so callers can skip the quality gate gracefully.
   */
  async extractEmbedding(photoB64: string): Promise<EmbeddingResult | null> {
    if (!this.baseUrl) {
      throw new Error('FACE_SVC_URL is not configured');
    }

    const url = `${this.baseUrl}/embed`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoB64 }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.error(`face-svc error ${resp.status}: ${text}`);
        if (this.allowFallback) {
          this.logger.warn('face-svc unavailable — skipping quality gate (fallback mode)');
          return null;
        }
        throw new Error(`face-svc returned ${resp.status}`);
      }

      const data = (await resp.json()) as {
        embedding: number[];
        model: string;
        quality_score: number;
      };

      return {
        embedding: data.embedding,
        model: data.model,
        qualityScore: data.quality_score,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.logger.error('face-svc request timed out');
      }
      if (this.allowFallback) {
        this.logger.warn('face-svc unavailable — skipping quality gate (fallback mode)');
        return null;
      }
      throw err;
    }
  }
}
