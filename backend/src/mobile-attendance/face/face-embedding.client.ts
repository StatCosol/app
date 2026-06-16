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
   * Send a base64 photo to face-svc and get back an embedding + quality score.
   */
  async extractEmbedding(photoB64: string): Promise<EmbeddingResult> {
    if (!this.baseUrl) {
      throw new Error('FACE_SVC_URL is not configured');
    }

    const url = `${this.baseUrl}/embed`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: photoB64 }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`face-svc error ${resp.status}: ${text}`);
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
  }
}
