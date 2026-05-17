import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'face_enrollments' })
@Index(['clientId'])
@Index(['branchId'])
export class FaceEnrollmentEntity {
  @PrimaryColumn({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({
    name: 'azure_person_id',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  azurePersonId: string | null;

  @Column({
    name: 'azure_person_group',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  azurePersonGroup: string | null;

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

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
