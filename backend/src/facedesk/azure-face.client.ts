import { Injectable, Logger } from '@nestjs/common';

export interface AzureDetectedFace {
  faceId: string;
}

export interface AzureSimilarFace {
  persistedFaceId: string;
  confidence: number;
  userData?: string;
}

/**
 * Thin REST client for Azure AI Face (Large Face List).
 * Configured when AZURE_FACE_ENDPOINT and AZURE_FACE_KEY are set.
 *
 * Microsoft gates Face features behind separate Limited Access approvals, and
 * they are granted independently. As of 2026-08-31 this resource has
 * **Verification and Liveness** but NOT **Identification** — probed directly:
 *
 *   detectLiveness/singleModal/sessions  -> 200
 *   detect?returnFaceId=true             -> 200 (400 on a junk image)
 *   largefacelists                       -> 200
 *   findsimilars / identify              -> 403 UnsupportedFeature
 *                                           "missing approval for: Identification"
 *
 * Credentials alone therefore do not mean every call will work. Duplicate
 * detection needs findsimilars, so it is gated separately on
 * AZURE_FACE_IDENTIFICATION — otherwise setting the credentials to enable
 * liveness would also switch on a duplicate path that 403s on every
 * enrolment and silently falls back to cosine, adding a failed round-trip to
 * each one.
 */
@Injectable()
export class AzureFaceClient {
  private readonly logger = new Logger(AzureFaceClient.name);
  private readonly endpoint = (process.env.AZURE_FACE_ENDPOINT ?? '')
    .trim()
    .replace(/\/+$/, '');
  private readonly apiKey = (process.env.AZURE_FACE_KEY ?? '').trim();
  private readonly apiVersion =
    process.env.AZURE_FACE_API_VERSION?.trim() || 'v1.0';

  /** Credentials present. Says nothing about which features are approved. */
  get configured(): boolean {
    return this.endpoint.length > 0 && this.apiKey.length > 0;
  }

  /**
   * Identification (findsimilars / identify) additionally requires Microsoft
   * approval for that specific feature. Opt in only once it is granted:
   * re-probe `POST /face/v1.0/findsimilars` and look for 200 rather than 403.
   */
  get identificationEnabled(): boolean {
    return (
      this.configured &&
      (process.env.AZURE_FACE_IDENTIFICATION ?? 'false').toLowerCase() ===
        'true'
    );
  }

  /**
   * @deprecated Ambiguous — it read as "Azure works" but only ever meant
   * "credentials are set". Use {@link configured} for credentials or
   * {@link identificationEnabled} for the duplicate-detection path.
   */
  get enabled(): boolean {
    return this.configured;
  }

  private url(path: string): string {
    return `${this.endpoint}/face/${this.apiVersion}${path}`;
  }

  private headers(json = false): Record<string, string> {
    return {
      'Ocp-Apim-Subscription-Key': this.apiKey,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async ensureLargeFaceList(largeFaceListId: string): Promise<void> {
    const resp = await fetch(this.url(`/largefacelists/${largeFaceListId}`), {
      method: 'PUT',
      headers: {
        ...this.headers(true),
      },
      body: JSON.stringify({
        name: largeFaceListId,
        recognitionModel: 'recognition_04',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok && resp.status !== 409) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Azure Face ensureLargeFaceList ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
  }

  async detectFace(image: Buffer): Promise<AzureDetectedFace | null> {
    const resp = await fetch(
      `${this.url('/detect')}?detectionModel=detection_03&recognitionModel=recognition_04&returnFaceId=true`,
      {
        method: 'POST',
        headers: this.headers(),
        body: new Uint8Array(image),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Azure Face detect ${resp.status}: ${body.slice(0, 200)}`);
    }
    const faces = (await resp.json()) as AzureDetectedFace[];
    return faces?.[0] ?? null;
  }

  async findSimilar(
    largeFaceListId: string,
    faceId: string,
    confidenceThreshold: number,
    maxCandidates = 5,
  ): Promise<AzureSimilarFace[]> {
    const resp = await fetch(this.url('/findsimilars'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({
        faceId,
        largeFaceListId,
        maxNumOfCandidatesReturned: maxCandidates,
        mode: 'matchPerson',
        confidenceThreshold,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Azure Face findSimilar ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    return (await resp.json()) as AzureSimilarFace[];
  }

  async addPersistedFace(
    largeFaceListId: string,
    image: Buffer,
    userData: string,
  ): Promise<string> {
    const resp = await fetch(
      `${this.url(`/largefacelists/${largeFaceListId}/persistedfaces`)}?userData=${encodeURIComponent(userData)}&detectionModel=detection_03`,
      {
        method: 'POST',
        headers: this.headers(),
        body: new Uint8Array(image),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Azure Face addPersistedFace ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    const data = (await resp.json()) as { persistedFaceId?: string };
    if (!data.persistedFaceId) {
      throw new Error('Azure Face addPersistedFace: missing persistedFaceId');
    }
    return data.persistedFaceId;
  }

  async deletePersistedFace(
    largeFaceListId: string,
    persistedFaceId: string,
  ): Promise<void> {
    const resp = await fetch(
      this.url(
        `/largefacelists/${largeFaceListId}/persistedfaces/${persistedFaceId}`,
      ),
      {
        method: 'DELETE',
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text().catch(() => '');
      this.logger.warn(
        `Azure Face deletePersistedFace ${resp.status}: ${body.slice(0, 120)}`,
      );
    }
  }

  /** Fire-and-forget training so new faces become searchable. */
  async trainLargeFaceList(largeFaceListId: string): Promise<void> {
    const resp = await fetch(
      this.url(`/largefacelists/${largeFaceListId}/train`),
      {
        method: 'POST',
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok && resp.status !== 409) {
      const body = await resp.text().catch(() => '');
      this.logger.warn(
        `Azure Face train ${resp.status}: ${body.slice(0, 120)}`,
      );
    }
  }
}
