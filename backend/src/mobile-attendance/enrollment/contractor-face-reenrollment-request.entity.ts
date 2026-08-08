import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ReenrollRequestSource,
  ReenrollRequestStatus,
} from './face-reenrollment-request.entity';

@Entity({ name: 'contractor_face_reenrollment_requests' })
@Index(['clientId', 'status'])
export class ContractorFaceReenrollmentRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'pending_embedding', type: 'bytea' })
  pendingEmbedding: Buffer;

  @Column({ name: 'embedding_model', type: 'varchar', length: 40, nullable: true })
  embeddingModel: string | null;

  @Column({ name: 'source', type: 'varchar', length: 10 })
  source: ReenrollRequestSource;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: ReenrollRequestStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
