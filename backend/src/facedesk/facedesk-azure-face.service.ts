import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AzureFaceClient } from './azure-face.client';
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

  async removeEnrollmentFace(
    clientId: string,
    persistedFaceId: string | null | undefined,
  ): Promise<void> {
    if (!this.enabled || !persistedFaceId) return;
    try {
      const listId = this.listIdForClient(clientId);
      await this.azure.deletePersistedFace(listId, persistedFaceId);
      this.scheduleTraining(listId);
    } catch (err) {
      this.logger.warn(
        `Azure removeEnrollmentFace failed: ${(err as Error)?.message}`,
      );
    }
  }
}
