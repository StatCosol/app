import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type KioskEnrollTicketStatus =
  | 'PENDING'
  | 'REVIEW_PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type KioskEnrollSubjectType = 'EMPLOYEE' | 'CONTRACTOR';

@Entity({ name: 'kiosk_enroll_tickets' })
@Index(['deviceId', 'status'])
@Index(['clientId', 'status'])
export class KioskEnrollTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'subject_type', type: 'varchar', length: 20 })
  subjectType: KioskEnrollSubjectType;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'contractor_employee_id', type: 'uuid', nullable: true })
  contractorEmployeeId: string | null;

  @Column({ name: 'subject_name', type: 'varchar', length: 250 })
  subjectName: string;

  @Column({ name: 'subject_code', type: 'varchar', length: 50, nullable: true })
  subjectCode: string | null;

  @Column({ name: 'consent_given', type: 'boolean', default: false })
  consentGiven: boolean;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: KioskEnrollTicketStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewed_by', type: 'text', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  embeddingModel: string | null;

  @Column({ name: 'pending_embedding', type: 'bytea', nullable: true })
  pendingEmbedding: Buffer | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'match_score_self', type: 'numeric', nullable: true })
  matchScoreSelf: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;
}
