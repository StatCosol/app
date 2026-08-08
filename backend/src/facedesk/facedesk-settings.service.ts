import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaceDeskSettingsEntity } from './entities/facedesk.entities';

/**
 * Effective FaceDesk thresholds for a client. Percentages are what the admin
 * sees/edits; cosine values are what the matcher actually uses.
 */
export interface EffectiveFaceSettings {
  // Admin-facing percentages (from face_settings).
  matchConfidencePct: number;
  retryConfidencePct: number;
  duplicatePct: number;
  minFaceSamples: number;
  frameCaptureCount: number;
  livenessRequired: boolean;
  offlineSyncEnabled: boolean;
  /** FaceDesk kiosks always use code + PIN followed by 1:1 face verification. */
  identificationMode: 'PIN_THEN_FACE';
  /** HH:MM (24h) for late/early reports; null → env default. */
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  // Calibrated cosine thresholds the matcher uses.
  acceptCosine: number;
  retryCosine: number;
  duplicateCosine: number;
  minMarginCosine: number;
}

/**
 * The spec expresses thresholds as percentages (95% accept, 90% retry/duplicate)
 * but the face model outputs cosine similarity where those literal values are
 * unreachable on MobileFaceNet. We therefore map percentage → cosine with a
 * monotonic, piecewise-linear calibration anchored to V1's proven working
 * thresholds, so "95%" means "the accept bar that actually works" rather than
 * a literal 0.95 cosine. Anchors are env-tunable per model rollout (ArcFace
 * will want different anchors).
 *
 *   percent →  cosine
 *   100%    →  FD_COSINE_AT_100   (default 0.95)
 *    95%    →  FD_COSINE_AT_95    (default 0.84  — V1 accept)
 *    90%    →  FD_COSINE_AT_90    (default 0.78  — V1 review floor)
 *    <=80%  →  FD_COSINE_AT_80    (default 0.60)
 * Linear interpolation between the nearest anchors; clamped to [0,1].
 */
@Injectable()
export class FaceDeskSettingsService {
  private readonly anchors: Array<{ pct: number; cos: number }>;
  private readonly minMargin = Number(process.env.FD_MIN_MARGIN_COSINE ?? 0.05);

  constructor(
    @InjectRepository(FaceDeskSettingsEntity)
    private readonly repo: Repository<FaceDeskSettingsEntity>,
  ) {
    this.anchors = [
      { pct: 100, cos: Number(process.env.FD_COSINE_AT_100 ?? 0.95) },
      { pct: 95, cos: Number(process.env.FD_COSINE_AT_95 ?? 0.84) },
      { pct: 90, cos: Number(process.env.FD_COSINE_AT_90 ?? 0.78) },
      { pct: 80, cos: Number(process.env.FD_COSINE_AT_80 ?? 0.6) },
      { pct: 0, cos: 0 },
    ].sort((a, b) => b.pct - a.pct);
  }

  /** Map an admin percentage to a calibrated cosine threshold. */
  percentToCosine(percent: number): number {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const a = this.anchors;
    for (let i = 0; i < a.length - 1; i++) {
      const hi = a[i];
      const lo = a[i + 1];
      if (p <= hi.pct && p >= lo.pct) {
        const span = hi.pct - lo.pct || 1;
        const t = (p - lo.pct) / span;
        return Math.max(0, Math.min(1, lo.cos + t * (hi.cos - lo.cos)));
      }
    }
    return a[a.length - 1].cos;
  }

  /** Load (or default) effective settings for a client. */
  async getEffective(clientId: string): Promise<EffectiveFaceSettings> {
    const row = await this.repo.findOne({ where: { clientId } });
    const matchPct = Number(row?.faceMatchConfidence ?? 95);
    const retryPct = Number(row?.faceRetryConfidence ?? 90);
    const dupPct = Number(row?.duplicateThreshold ?? 90);
    return {
      matchConfidencePct: matchPct,
      retryConfidencePct: retryPct,
      duplicatePct: dupPct,
      minFaceSamples: Number(row?.minFaceSamples ?? 5),
      frameCaptureCount: Number(row?.frameCaptureCount ?? 15),
      livenessRequired: row?.livenessRequired ?? true,
      offlineSyncEnabled: row?.offlineSyncEnabled ?? true,
      identificationMode: 'PIN_THEN_FACE',
      shiftStartTime: row?.shiftStartTime ?? null,
      shiftEndTime: row?.shiftEndTime ?? null,
      acceptCosine: this.percentToCosine(matchPct),
      retryCosine: this.percentToCosine(retryPct),
      duplicateCosine: this.percentToCosine(dupPct),
      minMarginCosine: this.minMargin,
    };
  }

  /** Convert a raw cosine back to a display percentage (inverse mapping). */
  cosineToPercent(cosine: number): number {
    const c = Math.max(0, Math.min(1, Number(cosine) || 0));
    const a = this.anchors;
    for (let i = 0; i < a.length - 1; i++) {
      const hi = a[i];
      const lo = a[i + 1];
      if (c <= hi.cos && c >= lo.cos) {
        const span = hi.cos - lo.cos || 1;
        const t = (c - lo.cos) / span;
        return Math.round(lo.pct + t * (hi.pct - lo.pct));
      }
    }
    return 0;
  }

  async upsert(
    clientId: string,
    patch: Partial<FaceDeskSettingsEntity>,
  ): Promise<FaceDeskSettingsEntity> {
    const existing = await this.repo.findOne({ where: { clientId } });
    const merged = this.repo.merge(
      existing ?? this.repo.create({ clientId }),
      patch,
      { clientId },
    );
    return this.repo.save(merged);
  }
}
