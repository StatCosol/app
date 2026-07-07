import { Injectable, Logger } from '@nestjs/common';
import {
  FaceEmbeddingClient,
  FaceQualityError,
} from '../mobile-attendance/face/face-embedding.client';
import {
  cosineSim,
  decodeEmbedding,
} from '../mobile-attendance/face/face-math';
import { FaceFrameDto } from './facedesk.dto';

export interface ResolvedFrame {
  embedding: Float32Array;
  model: string | null;
  qualityScore: number;
  livenessScore: number | null;
  sampleType: 'FRONT' | 'LEFT' | 'RIGHT' | 'EXPRESSION' | 'LIVENESS';
  reasons: string[];
}

const MIN_FRAME_QUALITY = Number(process.env.FD_MIN_FRAME_QUALITY ?? 0.5);

/**
 * Shared frame → embedding resolution and quality gating for FaceDesk V2.
 * Supports both the device-embedding path (offline-capable) and server-side
 * embedding via face-svc (photos), reusing the existing FaceEmbeddingClient.
 */
@Injectable()
export class FaceDeskFaceService {
  private readonly logger = new Logger(FaceDeskFaceService.name);

  constructor(private readonly faceClient: FaceEmbeddingClient) {}

  /** Resolve frames to embeddings + quality. Never throws on a single bad frame. */
  async resolveFrames(frames: FaceFrameDto[]): Promise<ResolvedFrame[]> {
    const out: ResolvedFrame[] = [];
    for (const f of frames ?? []) {
      try {
        if (f.photoB64 && this.faceClient.enabled) {
          const r = await this.faceClient.extractEmbedding(f.photoB64);
          if (r) {
            out.push({
              embedding: new Float32Array(r.embedding),
              model: r.model,
              qualityScore: r.quality?.faceScore ?? r.qualityScore ?? 0,
              livenessScore: r.livenessScore,
              sampleType: f.sampleType ?? 'FRONT',
              reasons: r.quality?.reasons ?? [],
            });
          }
        } else if (f.embeddingB64) {
          out.push({
            embedding: decodeEmbedding(f.embeddingB64),
            model: f.embeddingModel ?? null,
            qualityScore: f.qualityScore ?? 1,
            livenessScore: f.livenessScore ?? null,
            sampleType: f.sampleType ?? 'FRONT',
            reasons: [],
          });
        }
      } catch (err) {
        if (err instanceof FaceQualityError) {
          out.push({
            embedding: new Float32Array(),
            model: null,
            qualityScore: 0,
            livenessScore: null,
            sampleType: f.sampleType ?? 'FRONT',
            reasons: err.quality?.reasons ?? ['low_quality'],
          });
        } else {
          this.logger.warn(`frame resolve failed: ${(err as Error)?.message}`);
        }
      }
    }
    return out;
  }

  /** Frames that pass the quality bar and carry a usable embedding. */
  goodFrames(frames: ResolvedFrame[]): ResolvedFrame[] {
    return frames.filter(
      (f) => f.embedding.length > 0 && f.qualityScore >= MIN_FRAME_QUALITY,
    );
  }

  /** Top-N frames by quality. */
  bestFrames(frames: ResolvedFrame[], n: number): ResolvedFrame[] {
    return [...frames]
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, n);
  }

  /** Human-facing reason for a failed capture, mapped to a simple message. */
  simpleQualityMessage(frames: ResolvedFrame[]): string {
    const reasons = new Set(frames.flatMap((f) => f.reasons));
    if (reasons.has('no_face')) return 'Face not clear — look at the camera';
    for (const r of reasons) {
      if (r.startsWith('too_dark')) return 'Too dark — improve lighting';
      if (r.startsWith('too_bright')) return 'Too much light';
      if (r.startsWith('too_blurry')) return 'Face not clear — hold still';
      if (r.startsWith('face_too_small')) return 'Move closer to the camera';
    }
    return 'Face not clear — please try again';
  }

  cosine(a: Float32Array, b: Float32Array): number {
    return cosineSim(a, b);
  }
}
