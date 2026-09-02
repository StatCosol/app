import { Injectable, Logger } from '@nestjs/common';

export interface AzureDetectedFace {
  faceId: string;
}

export interface AzureSimilarFace {
  persistedFaceId: string;
  confidence: number;
  userData?: string;
}
/** What a created liveness session hands back. Only these two ever reach a device. */
export interface AzureLivenessSession {
  sessionId: string;
  authToken: string;
}

export interface AzureLivenessAttempt {
  attemptStatus: string;
  livenessDecision?: string;
  sessionImageId?: string;
  errorCode?: string;
}

export interface AzureLivenessSessionResult {
  sessionId: string;
  status: string;
  attempts: AzureLivenessAttempt[];
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

  /**
   * Liveness sessions live on v1.2 — the Large Face List calls above are v1.0,
   * so they cannot share a base path. Overridable for when v1.3 goes GA.
   *
   * Note the shape: the session result is a GET on the session itself.
   * Microsoft's C#/Java/Python samples show /livenessSessions/{id}/result,
   * which 404s against a real resource; only this form answers 200.
   */
  private readonly livenessApiVersion =
    process.env.AZURE_FACE_LIVENESS_API_VERSION?.trim() || 'v1.2';

  private livenessUrl(): string {
    return `${this.endpoint}/face/${this.livenessApiVersion}/detectLiveness-sessions`;
  }

  private headers(json = false): Record<string, string> {
    return {
      'Ocp-Apim-Subscription-Key': this.apiKey,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  /**
   * Headers for the calls that POST raw image bytes.
   *
   * Azure REQUIRES an explicit octet-stream content type on these. Node's fetch
   * sends no Content-Type for a Uint8Array body, and Azure then tries to parse
   * the image as JSON and fails with:
   *
   *   400 BadArgument "JSON parsing error."
   *
   * which names neither the header nor the image, so it reads like a malformed
   * request rather than a missing content type. Verified against the live
   * resource: without the header the call is rejected at media-type validation;
   * with it, the same bytes reach face detection.
   */
  private binaryHeaders(): Record<string, string> {
    return {
      ...this.headers(),
      'Content-Type': 'application/octet-stream',
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
        headers: this.binaryHeaders(),
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
        headers: this.binaryHeaders(),
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

  /**
   * Removes a face from a list. Treats 404 as success (already gone) and
   * resolves rather than throwing on other HTTP failures, but RETURNS whether
   * the face is actually gone — a caller deleting an enrolment needs to know,
   * because a silent failure leaves biometric data in Azure after the profile
   * row that recorded its id has been deleted.
   */
  async deletePersistedFace(
    largeFaceListId: string,
    persistedFaceId: string,
  ): Promise<boolean> {
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
      return false;
    }
    return true;
  }

  /**
   * Training, so newly added faces become searchable by findsimilars.
   *
   * Resolves rather than throwing on an HTTP failure, because the enrolment
   * path fires this and forgets. It returns whether Azure actually accepted
   * the request, so a caller that CANNOT afford a silent failure — the
   * backfill, which would otherwise leave a fully populated list permanently
   * unsearchable — can see it and retry.
   */
  async trainLargeFaceList(largeFaceListId: string): Promise<boolean> {
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
      return false;
    }
    return true;
  }

  /**
   * Create an on-device liveness session.
   *
   * The device runs Azure's Vision SDK against the returned authToken; the
   * account key never leaves the server. Liveness needs only credentials — it
   * is NOT gated on `identificationEnabled`, which covers 1:N search.
   */
  async createLivenessSession(opts: {
    deviceCorrelationId: string;
    livenessOperationMode?: string;
    enableSessionImage?: boolean;
  }): Promise<AzureLivenessSession> {
    const resp = await fetch(this.livenessUrl(), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({
        livenessOperationMode: opts.livenessOperationMode ?? 'Passive',
        deviceCorrelationId: opts.deviceCorrelationId,
        enableSessionImage: opts.enableSessionImage ?? true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Azure Face createLivenessSession ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    const data = (await resp.json()) as Partial<AzureLivenessSession>;
    if (!data.sessionId || !data.authToken) {
      throw new Error('Azure Face createLivenessSession: incomplete session');
    }
    return { sessionId: data.sessionId, authToken: data.authToken };
  }

  /**
   * Read a session's verdict. The device never sees this — per Azure's flow the
   * SDK only reports that it finished, and the decision is read server-side.
   */
  async getLivenessSessionResult(
    sessionId: string,
  ): Promise<AzureLivenessSessionResult> {
    const resp = await fetch(`${this.livenessUrl()}/${sessionId}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Azure Face getLivenessSessionResult ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    const data = (await resp.json()) as {
      sessionId?: string;
      status?: string;
      results?: { attempts?: Array<Record<string, any>> };
    };
    return {
      sessionId: data.sessionId ?? sessionId,
      status: data.status ?? 'Unknown',
      attempts: (data.results?.attempts ?? []).map((a) => ({
        attemptStatus: String(a.attemptStatus ?? 'Unknown'),
        livenessDecision: a.result?.livenessDecision,
        sessionImageId: a.result?.sessionImageId,
        errorCode: a.error?.code,
      })),
    };
  }

  /** Sessions are cheap but not free to leave lying around; delete once read. */
  async deleteLivenessSession(sessionId: string): Promise<boolean> {
    const resp = await fetch(`${this.livenessUrl()}/${sessionId}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text().catch(() => '');
      this.logger.warn(
        `Azure Face deleteLivenessSession ${resp.status}: ${body.slice(0, 120)}`,
      );
      return false;
    }
    return true;
  }

}
