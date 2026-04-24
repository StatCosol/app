import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('branch_documents')
@Index('idx_branchdoc_client', ['clientId'])
@Index('idx_branchdoc_branch', ['branchId'])
@Index('idx_branchdoc_category', ['category'])
@Index('idx_branchdoc_status', ['status'])
export class BranchDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  /** REGISTRATION | COMPLIANCE_MONTHLY | AUDIT_EVIDENCE */
  @Column({
    name: 'category',
    type: 'varchar',
    length: 50,
    default: 'REGISTRATION',
  })
  category: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 255 })
  docType: string;

  @Column({ name: 'period_year', type: 'int', nullable: true })
  periodYear: number | null;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth: number | null;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'file_name', type: 'varchar', length: 512 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize: number;

  /** UPLOADED | UNDER_REVIEW | APPROVED | REJECTED */
  @Column({ name: 'status', type: 'varchar', length: 30, default: 'UPLOADED' })
  status: string;

  /** CRM | AUDITOR | PAYROLL */
  @Column({
    name: 'reviewer_role',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  reviewerRole: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @Column({ name: 'uploaded_by_role', type: 'varchar', length: 20, nullable: true })
  uploadedByRole: string | null;

  @Column({ name: 'acting_on_behalf', type: 'boolean', default: false })
  actingOnBehalf: boolean;

  @Column({ name: 'original_owner_role', type: 'varchar', length: 20, nullable: true })
  originalOwnerRole: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
