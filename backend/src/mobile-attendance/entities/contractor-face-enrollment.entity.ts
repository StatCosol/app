import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Phase 4a: face-attendance bridge for contractor employees.
 *
 * Parallels FaceEnrollmentEntity (which is keyed by employees.id) — this
 * table is keyed by contractor_employees.id. Kept structurally identical
 * so service code can stay symmetric, except that we don't carry the
 * Azure-Face person fields (Azure path was only used by the in-house
 * roster and stays disabled here until that integration ships).
 */
@Entity({ name: 'contractor_face_enrollments' })
@Index(['clientId'])
@Index(['branchId'])
export class ContractorFaceEnrollmentEntity {
  @PrimaryColumn({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'contractor_user_id', type: 'uuid', nullable: true })
  contractorUserId: string | null;

  @Column({ name: 'embedding', type: 'bytea', nullable: true })
  embedding: Buffer | null;

  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  embeddingModel: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'consent_given_at', type: 'timestamptz', nullable: true })
  consentGivenAt: Date | null;

  @Column({ name: 'consent_given_by', type: 'uuid', nullable: true })
  consentGivenBy: string | null;

  @Column({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt: Date;

  @Column({ name: 'enrolled_by', type: 'uuid', nullable: true })
  enrolledBy: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  @Column({ name: 'deactivation_reason', type: 'text', nullable: true })
  deactivationReason: string | null;

  @Column({
    name: 'appearance_drift_flagged_at',
    type: 'timestamptz',
    nullable: true,
  })
  appearanceDriftFlaggedAt: Date | null;

  @Column({
    name: 'appearance_drift_avg_score',
    type: 'numeric',
    nullable: true,
  })
  appearanceDriftAvgScore: string | null;

  @Column({
    name: 'appearance_drift_sample_count',
    type: 'integer',
    nullable: true,
  })
  appearanceDriftSampleCount: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
