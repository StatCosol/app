import { HttpException, Injectable, Logger } from '@nestjs/common';

/**
 * Thin HTTP client for the `face-svc` microservice.
 *
 * The service runs in the same Container Apps environment with internal-only
 * ingress and is reached via internal DNS, configured through the
 * `FACE_SVC_URL` env var (e.g. `http://statcompy-face-svc`).
 *
 * If `FACE_SVC_URL` is unset the client is "disabled" — `isEnabled()` returns
 * false and callers should fall back to whatever they were doing before
 * (e.g. storing the photo with NULL embedding for batch processing later).
 */
@Injectable()
export class FaceEmbeddingClient {
  private readonly logger = new Logger(FaceEmbeddingClient.name);
  private readonly baseUrl = (process.env.FACE_SVC_URL || '').replace(
    /\/$/,
    '',
  );
  private readonly timeoutMs = Number(process.env.FACE_SVC_TIMEOUT_MS || 15000);
  private readonly apiKey = (process.env.FACE_SVC_API_KEY || '').trim();

  isEnabled(): boolean {
    return !!this.baseUrl;
  }

  /**
   * Compute a 192-d MobileFaceNet embedding from a photo.
   *
   * @param photoBase64 base64-encoded JPEG/PNG (no data: prefix)
   * @returns null if the service is not configured.
   * @throws HttpException with the upstream status when the service responds
   *         with a recognised error (no_face, decode_failed, ...).
   */
  async embedPhoto(photoBase64: string): Promise<{
    embeddingBase64: string;
    embeddingModel: string;
    faceScore: number;
  } | null> {
    if (!this.isEnabled()) return null;
    const url = `${this.baseUrl}/embed`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (this.apiKey) headers['x-face-svc-key'] = this.apiKey;
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ photoBase64 }),
        signal: ctrl.signal,
      });
    } catch (err) {
      this.logger.warn(`face-svc unreachable: ${(err as Error).message}`);
      throw new HttpException('face_svc_unreachable', 502);
    } finally {
      clearTimeout(timer);
    }

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // ignore JSON parse — body may be empty on 5xx
    }

    if (!res.ok || !body?.ok) {
      const code: string = body?.error || `http_${res.status}`;
      this.logger.warn(`face-svc rejected photo: ${code}`);
      // Map known errors to 4xx, everything else to 502 (upstream failure).
      if (
        code === 'no_face' ||
        code === 'decode_failed' ||
        code === 'bad_crop'
      ) {
        throw new HttpException(`face_${code}`, 422);
      }
      throw new HttpException(`face_svc_error:${code}`, 502);
    }

    return {
      embeddingBase64: body.embeddingBase64 as string,
      embeddingModel: (body.embeddingModel as string) || 'mobilefacenet-v1',
      faceScore: Number(body.faceScore || 0),
    };
  }
}
