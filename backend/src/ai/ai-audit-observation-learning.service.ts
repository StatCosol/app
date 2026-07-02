import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditRemarkMasterEntity } from './entities/audit-remark-master.entity';
import { AiAuditObservationEntity } from './entities/ai-audit-observation.entity';

export interface RemarkSearchInput {
  findingDescription: string;
  findingType?: string | null;
  stateCode?: string | null;
  actCode?: string | null;
  clientId?: string | null;
  limit?: number;
  minSimilarity?: number;
}

export interface RemarkMatch {
  remark: AuditRemarkMasterEntity;
  similarity: number;
}

/**
 * Phase 2 — AI Observation Learning Library.
 *
 * Stores curated/approved audit observations and serves them on similar
 * findings via pg_trgm fuzzy matching, eliminating redundant OpenAI calls.
 */
@Injectable()
export class AiAuditObservationLearningService {
  private readonly logger = new Logger(AiAuditObservationLearningService.name);

  constructor(
    @InjectRepository(AuditRemarkMasterEntity)
    private readonly remarkRepo: Repository<AuditRemarkMasterEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Normalize finding text — lowercase, strip punctuation, collapse whitespace, drop common stopwords. */
  normalize(text: string): string {
    if (!text) return '';
    const stop = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'and',
      'or',
      'of',
      'for',
      'to',
      'in',
      'on',
      'at',
      'by',
      'with',
      'as',
      'that',
      'this',
      'these',
      'those',
      'it',
      'its',
      'has',
      'have',
      'had',
      'do',
      'does',
      'did',
      'not',
      'no',
      'but',
    ]);
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !stop.has(w))
      .join(' ')
      .trim();
  }

  /** Stable signature for exact-duplicate detection. */
  signature(
    normalized: string,
    scope?: { stateCode?: string | null; findingType?: string | null },
  ): string {
    const key = `${normalized}|${scope?.stateCode || ''}|${scope?.findingType || ''}`;
    return crypto.createHash('sha1').update(key).digest('hex').slice(0, 32);
  }

  /**
   * Find similar curated remarks ranked by trigram similarity.
   * Returns matches whose similarity >= minSimilarity (default 0.45).
   */
  async findSimilar(input: RemarkSearchInput): Promise<RemarkMatch[]> {
    const normalized = this.normalize(input.findingDescription || '');
    if (!normalized || normalized.length < 6) return [];

    const limit = Math.min(Math.max(input.limit ?? 5, 1), 25);
    const minSim = input.minSimilarity ?? 0.45;

    const rows = await this.dataSource
      .query(
        `
        SELECT *,
               similarity(normalized_finding, $1) AS sim
        FROM audit_remark_master
        WHERE is_active = true
          AND ($2::varchar IS NULL OR finding_type IS NULL OR finding_type = $2)
          AND ($3::varchar IS NULL OR state_code IS NULL OR state_code = $3)
          AND ($4::varchar IS NULL OR act_code IS NULL OR act_code = $4)
          AND similarity(normalized_finding, $1) >= $5
        ORDER BY sim DESC, usage_count DESC
        LIMIT $6
        `,
        [
          normalized,
          input.findingType || null,
          input.stateCode || null,
          input.actCode || null,
          minSim,
          limit,
        ],
      )
      .catch((err: any) => {
        this.logger.warn(
          `audit_remark_master lookup failed (table missing?): ${err?.message}`,
        );
        return [] as any[];
      });

    return (rows || []).map((r: any) => ({
      remark: this.rowToEntity(r),
      similarity: Number(r.sim) || 0,
    }));
  }

  /** Best single match if its similarity >= reuseThreshold (default 0.65). */
  async findBestReusable(
    input: RemarkSearchInput,
    reuseThreshold = 0.65,
  ): Promise<RemarkMatch | null> {
    const matches = await this.findSimilar({
      ...input,
      limit: 1,
      minSimilarity: reuseThreshold,
    });
    return matches.length > 0 ? matches[0] : null;
  }

  /** Increment usage stats when a remark is reused. */
  async recordUsage(remarkId: string): Promise<void> {
    await this.remarkRepo
      .createQueryBuilder()
      .update(AuditRemarkMasterEntity)
      .set({ usageCount: () => 'usage_count + 1', lastUsedAt: new Date() })
      .where('id = :id', { id: remarkId })
      .execute()
      .catch((err) => this.logger.warn(`recordUsage failed: ${err?.message}`));
  }

  /**
   * Persist an approved AI observation into the master library so future
   * similar findings can be served from cache.
   */
  async upsertFromObservation(
    obs: AiAuditObservationEntity,
    opts: {
      source?: 'AI' | 'HUMAN' | 'SEED';
      stateCode?: string | null;
      actCode?: string | null;
      complianceArea?: string | null;
      documentType?: string | null;
      approvedBy?: string | null;
    } = {},
  ): Promise<AuditRemarkMasterEntity | null> {
    if (!obs?.findingDescription || !obs?.observationText) return null;

    const normalized = this.normalize(obs.findingDescription);
    const stateCode = opts.stateCode || obs.applicableState || null;
    const sig = this.signature(normalized, {
      stateCode,
      findingType: obs.findingType,
    });

    // Skip if exact signature already exists.
    const existing = await this.remarkRepo
      .findOne({ where: { findingSignature: sig, isActive: true } })
      .catch(() => null);
    if (existing) return existing;

    const entity = this.remarkRepo.create({
      clientId: obs.clientId || null,
      stateCode: stateCode ? String(stateCode).slice(0, 8) : null,
      actCode: opts.actCode || null,
      complianceArea: opts.complianceArea || null,
      documentType: opts.documentType || null,
      findingType: obs.findingType || null,
      rawFinding: obs.findingDescription,
      normalizedFinding: normalized,
      findingSignature: sig,
      observationTitle: obs.observationTitle || null,
      observationText: obs.observationText || null,
      consequence: obs.consequence || null,
      sectionReference: obs.sectionReference || null,
      fineEstimationMin:
        obs.fineEstimationMin != null ? String(obs.fineEstimationMin) : null,
      fineEstimationMax:
        obs.fineEstimationMax != null ? String(obs.fineEstimationMax) : null,
      riskRating: obs.riskRating || null,
      correctiveAction: obs.correctiveAction || null,
      timelineDays: obs.timelineDays ?? null,
      stateSpecificRules: obs.stateSpecificRules || null,
      source: opts.source || 'AI',
      confidenceScore: obs.confidenceScore ?? null,
      createdBy: obs.reviewedBy || null,
      approvedBy: opts.approvedBy || obs.reviewedBy || null,
      approvedAt: new Date(),
      usageCount: 0,
      isActive: true,
    });
    return this.remarkRepo.save(entity).catch((err) => {
      this.logger.warn(`upsertFromObservation save failed: ${err?.message}`);
      return null;
    });
  }

  /** Search endpoint payload: lightweight projection. */
  async search(
    query: RemarkSearchInput,
  ): Promise<{ matches: Array<RemarkMatch> }> {
    const matches = await this.findSimilar({
      ...query,
      limit: query.limit ?? 10,
    });
    return { matches };
  }

  /** Convert raw query row to entity-shaped object. */
  private rowToEntity(r: any): AuditRemarkMasterEntity {
    return {
      id: r.id,
      clientId: r.client_id,
      stateCode: r.state_code,
      actCode: r.act_code,
      complianceArea: r.compliance_area,
      documentType: r.document_type,
      findingType: r.finding_type,
      rawFinding: r.raw_finding,
      normalizedFinding: r.normalized_finding,
      findingSignature: r.finding_signature,
      observationTitle: r.observation_title,
      observationText: r.observation_text,
      consequence: r.consequence,
      sectionReference: r.section_reference,
      fineEstimationMin: r.fine_estimation_min,
      fineEstimationMax: r.fine_estimation_max,
      riskRating: r.risk_rating,
      correctiveAction: r.corrective_action,
      timelineDays: r.timeline_days,
      stateSpecificRules: r.state_specific_rules,
      source: r.source,
      confidenceScore: r.confidence_score,
      createdBy: r.created_by,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      usageCount: Number(r.usage_count) || 0,
      lastUsedAt: r.last_used_at,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } as AuditRemarkMasterEntity;
  }
}
