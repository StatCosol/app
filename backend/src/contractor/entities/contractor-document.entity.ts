import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('contractor_documents')
@Index('idx_cd_contractor_user_id', ['contractorUserId'])
@Index('idx_cd_client_id', ['clientId'])
@Index('idx_cd_branch_id', ['branchId'])
@Index('idx_cd_audit_id', ['auditId'])
@Index('idx_cd_observation_id', ['observationId'])
@Index('idx_cd_uploaded_by_user_id', ['uploadedByUserId'])
@Index('idx_cd_created_at', ['createdAt'])
export class ContractorDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // users.id (the contractor user this document belongs to)
  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contractor_user_id' })
  contractorUser?: UserEntity;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 255 })
  docType: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'audit_id', type: 'uuid', nullable: true })
  auditId: string | null;

  @Column({ name: 'observation_id', type: 'uuid', nullable: true })
  observationId: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'file_type', type: 'varchar', length: 100, nullable: true })
  fileType: string | null;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: string | null;

  // users.id (who uploaded) — can be contractor, CRM, admin, etc.
  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy?: UserEntity;

  @Column({ type: 'varchar', default: 'UPLOADED' })
  status: string; // UPLOADED, PENDING_REVIEW, APPROVED, REJECTED, EXPIRED

  @Column({ name: 'doc_month', type: 'varchar', length: 7, nullable: true })
  docMonth: string | null; // YYYY-MM format for month-based tracking

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
