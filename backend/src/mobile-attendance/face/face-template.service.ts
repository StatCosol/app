import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FaceEnrollmentTemplateEntity } from '../enrollment/face-enrollment-template.entity';
import { embeddingToBuffer } from './face-math';

const MAX_TEMPLATES = Number(process.env.FACE_MAX_TEMPLATES ?? 4);

/**
 * Shared writer for the multi-template gallery. Inserts a template and evicts
 * the oldest rows beyond FACE_MAX_TEMPLATES (per subject).
 */
@Injectable()
export class FaceTemplateService {
  constructor(private readonly dataSource: DataSource) {}

  async appendTemplate(
    clientId: string,
    branchId: string | null,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    subjectId: string,
    embedding: Float32Array,
    embeddingModel: string | null,
    source: 'ENROLL' | 'RE_ENROLL' | 'AUTO_REFRESH',
    createdBy: string | null = null,
    qualityScore: number | null = null,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(FaceEnrollmentTemplateEntity).save({
        clientId,
        branchId,
        subjectType,
        subjectId,
        embedding: embeddingToBuffer(embedding),
        embeddingModel,
        source,
        createdBy,
        qualityScore,
      });
      // Keep the newest MAX_TEMPLATES rows per subject.
      await em.query(
        `DELETE FROM face_enrollment_templates
          WHERE id IN (
            SELECT id FROM face_enrollment_templates
             WHERE subject_type = $1 AND subject_id = $2
             ORDER BY created_at DESC
            OFFSET $3
          )`,
        [subjectType, subjectId, MAX_TEMPLATES],
      );
    });
  }

  /** Remove all templates for a subject (used on deactivation / DPDP shred). */
  async purgeSubject(
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    subjectId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM face_enrollment_templates
        WHERE subject_type = $1 AND subject_id = $2`,
      [subjectType, subjectId],
    );
  }
}
