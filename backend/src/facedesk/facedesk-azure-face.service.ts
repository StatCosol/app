import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AzureFaceClient,
  AzureLivenessSession,
} from './azure-face.client';
import {
  FaceDeskProfileEntity,
  FaceDeskSettingsEntity,
} from './entities/facedesk.entities';

export interface AzureDuplicateHit {
  matchedEmployeeId: string;
  confidence: number;
}

/** Per-client Azure Large Face List for high-accuracy duplicate detection. */
@Injectable()
export class FaceDeskAzureFaceService {
  private readonly logger = new Logger(FaceDeskAzureFaceService.name);
  private readonly duplicateConfidence = Number(
    process.env.AZURE_FACE_DUPLICATE_CONFIDENCE ?? 0.72,
  );

  constructor(
    private readonly azure: AzureFaceClient,
    @InjectRepository(FaceDeskSettingsEntity)
    private readonly settingsRepo: Repository<FaceDeskSettingsEntity>,
    @InjectRepository(FaceDeskProfileEntity)
    private readonly profileRepo: Repository<FaceDeskProfileEntity>,
  ) {}

  private scheduleTraining(listId: string): void {
    void this.azure.trainLargeFaceList(listId).catch((err) =>
      this.logger.warn(
        `Azure train failed: ${(err as Error)?.message ?? err}`,
      ),
    );
  }

  /**
   * Duplicate detection runs on findsimilars, which needs Microsoft's
   * Identification approval on top of credentials. Gate on that specifically,
   * so turning Azure on for liveness does not start a duplicate path that
   * 403s on every enrolment.
   */
  get enabled(): boolean {
    return this.azure.identificationEnabled;
  }

  listIdForClient(clientId: string): string {
    return `sc-${clientId.replace(/-/g, '')}`;
  }

  private decodePhoto(photoB64: string): Buffer {
    const raw = photoB64.includes(',')
      ? photoB64.split(',', 2)[1]
      : photoB64;
    return Buffer.from(raw, 'base64');
  }

  async ensureClientList(clientId: string): Promise<string> {
    const listId = this.listIdForClient(clientId);
    await this.azure.ensureLargeFaceList(listId);
    const row = await this.settingsRepo.findOne({ where: { clientId } });
    if (row && row.azureFaceListId !== listId) {
      row.azureFaceListId = listId;
      await this.settingsRepo.save(row);
    } else if (!row) {
      await this.settingsRepo.save(
        this.settingsRepo.create({ clientId, azureFaceListId: listId }),
      );
    }
    return listId;
  }

  /**
   * 1:N duplicate search via Azure Face. Returns null when Azure is disabled,
   * no face is detected, or no match above the confidence floor.
   */
  async findDuplicate(
    clientId: string,
    photoB64: string,
    excludeEmployeeId: string,
  ): Promise<AzureDuplicateHit | null> {
    if (!this.enabled) return null;
    try {
      const listId = await this.ensureClientList(clientId);
      const image = this.decodePhoto(photoB64);
      const detected = await this.azure.detectFace(image);
      if (!detected?.faceId) return null;

      const matches = await this.azure.findSimilar(
        listId,
        detected.faceId,
        this.duplicateConfidence,
      );
      for (const match of matches) {
        if (match.confidence < this.duplicateConfidence) continue;
        const profile = await this.profileRepo.findOne({
          where: { clientId, azurePersistedFaceId: match.persistedFaceId },
        });
        if (!profile || profile.employeeId === excludeEmployeeId) continue;
        return {
          matchedEmployeeId: profile.employeeId,
          confidence: match.confidence,
        };
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `Azure duplicate check failed, falling back to cosine: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  async registerEnrollmentFace(
    clientId: string,
    employeeId: string,
    photoB64: string,
    existingPersistedFaceId?: string | null,
  ): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const listId = await this.ensureClientList(clientId);
      const image = this.decodePhoto(photoB64);
      const persistedFaceId = await this.azure.addPersistedFace(
        listId,
        image,
        employeeId,
      );
      if (existingPersistedFaceId && existingPersistedFaceId !== persistedFaceId) {
        await this.azure
          .deletePersistedFace(listId, existingPersistedFaceId)
          .catch(() => undefined);
      }
      this.scheduleTraining(listId);
      return persistedFaceId;
    } catch (err) {
      this.logger.warn(
        `Azure registerEnrollmentFace failed: ${(err as Error)?.message}`,
      );
      return null;
    }
  }
  /**
   * Remove an enrolment’s face from Azure.
   *
   * Returns whether the face is actually gone. The caller deletes the profile
   * row straight after, and that row holds the only record of the persisted
   * face id — so a silently failed delete strands biometric data in Azure with
   * nothing left to identify it by. It must be reported, not swallowed.
   */
  async removeEnrollmentFace(
    clientId: string,
    persistedFaceId: string | null | undefined,
  ): Promise<boolean> {
    // Nothing to remove is not a failure.
    if (!this.enabled || !persistedFaceId) return true;
    try {
      const listId = this.listIdForClient(clientId);
      const removed = await this.azure.deletePersistedFace(
        listId,
        persistedFaceId,
      );
      if (removed) this.scheduleTraining(listId);
      return removed;
    } catch (err) {
      this.logger.warn(
        `Azure removeEnrollmentFace failed: ${(err as Error)?.message}`,
      );
      return false;
    }
  }

  /**
   * Backfill helper: add one already-enrolled face to a list the caller has
   * ALREADY ensured.
   *
   * Takes a listId rather than a clientId on purpose. ensureLargeFaceList is
   * an unconditional Azure PUT, so folding it in here would cost TWO Azure
   * transactions per profile — silently doubling the backfill’s real request
   * rate against the shared 10 TPS S0 cap. The caller ensures the list once
   * per batch and this stays exactly one transaction per face, so pacing on
   * profiles genuinely is pacing on transactions.
   *
   * Throws instead of returning null: the caller has to tell a transient
   * Azure failure (worth retrying later) from a profile with no usable photo
   * (which never will be), and a swallowed null collapses that distinction.
   */
  async addFaceToList(
    listId: string,
    employeeId: string,
    photoB64: string,
  ): Promise<string> {
    return this.azure.addPersistedFace(
      listId,
      this.decodePhoto(photoB64),
      employeeId,
    );
  }

  /**
   * Train a client’s list once, after a backfill batch. Faces added to a
   * Large Face List are not searchable by findsimilars until it is trained.
   *
   * Returns whether Azure accepted the request. A swallowed failure here
   * would leave every face just added permanently unsearchable, with nothing
   * to signal it.
   */
  async trainClientList(clientId: string): Promise<boolean> {
    return this.azure.trainLargeFaceList(this.listIdForClient(clientId));
  }

  /**
   * Liveness is gated on credentials ALONE, not on identificationEnabled.
   * Microsoft grants Face features independently: this resource has Liveness
   * and Verification but 1:N Identification is a separate approval, so tying
   * liveness to the duplicate-search flag would switch off a feature we do
   * have because of one we might not.
   */
  get livenessEnabled(): boolean {
    return this.azure.configured;
  }

  /**
   * Create a liveness session for one kiosk.
   *
   * Only the sessionId and a short-lived authToken go back to the device — the
   * account key stays server-side, which is the whole point of doing this here
   * rather than shipping credentials in the APK. deviceCorrelationId is the
   * kiosk's own id so Azure-side sessions are attributable to a device.
   */
  async createDeviceLivenessSession(
    deviceId: string,
  ): Promise<AzureLivenessSession> {
    if (!this.livenessEnabled) {
      throw new ServiceUnavailableException(
        'Azure Face liveness is not configured on this deployment',
      );
    }
    return this.azure.createLivenessSession({ deviceCorrelationId: deviceId });
  }

  /**
   * Read a session verdict server-side.
   *
   * Deliberately not exposed to the device: in Azure's flow the SDK only
   * reports that it finished, and the decision is read by the app server. A
   * kiosk that could read (or assert) its own verdict would defeat the point of
   * doing liveness at all.
   *
   * Returns null rather than throwing when Azure is unreachable, so a punch
   * path can fall back rather than fail closed on a network blip.
   */
  async readLivenessVerdict(
    sessionId: string,
  ): Promise<{ decision: string | null; status: string } | null> {
    if (!this.livenessEnabled) return null;
    try {
      const result = await this.azure.getLivenessSessionResult(sessionId);
      const latest = result.attempts[result.attempts.length - 1];
      return {
        decision:
          latest?.attemptStatus === 'Succeeded'
            ? (latest.livenessDecision ?? null)
            : null,
        status: result.status,
      };
    } catch (err) {
      this.logger.warn(
        `Azure liveness result lookup failed: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

}
