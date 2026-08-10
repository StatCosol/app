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
 * Active when AZURE_FACE_ENDPOINT and AZURE_FACE_KEY are set.
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

  get enabled(): boolean {
    return this.endpoint.length > 0 && this.apiKey.length > 0;
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
    const resp = await fetch(
      this.url(`/largefacelists/${largeFaceListId}/findsimilars`),
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({
          faceId,
          maxNumOfCandidatesReturned: maxCandidates,
          mode: 'matchPerson',
          confidenceThreshold,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
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
      `${this.url(`/largefacelists/${largeFaceListId}/faces`)}?userData=${encodeURIComponent(userData)}&detectionModel=detection_03`,
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
