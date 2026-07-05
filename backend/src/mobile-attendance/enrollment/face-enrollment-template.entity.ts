import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Additional face templates per subject (multi-template 1:N matching).
 *
 * The primary face_enrollments / contractor_face_enrollments row remains the
 * identity + consent record (and holds template #0, the averaged enrollment
 * embedding). Rows here hold extra poses/sessions. Matching takes the MAX
 * cosine across all templates of a subject, so a frontal probe matches the
 * frontal template even when the averaged one has drifted.
 *
 * Capped per subject via FACE_MAX_TEMPLATES (oldest evicted first).
 */
@Entity({ name: 'face_enrollment_templates' })
@Index(['clientId'])
@Index(['subjectType', 'subjectId'])
export class FaceEnrollmentTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'subject_type', type: 'varchar', length: 12 })
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @Column({ name: 'embedding', type: 'bytea' })
  embedding: Buffer;

  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  embeddingModel: string | null;

  /** Where this template came from: ENROLL | RE_ENROLL | AUTO_REFRESH */
  @Column({ name: 'source', type: 'varchar', length: 20, default: 'ENROLL' })
  source: string;

  @Column({ name: 'quality_score', type: 'numeric', nullable: true })
  qualityScore: number | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
