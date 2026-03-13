import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'safety_documents' })
export class SafetyDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'document_type', type: 'varchar', length: 100 })
  documentType: string;

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'file_path', type: 'varchar', length: 1000 })
  filePath: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  /* ─── v2 columns ─── */

  @Column({ name: 'category', type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'frequency', type: 'varchar', length: 30, nullable: true })
  frequency: string | null;

  @Column({
    name: 'applicable_to',
    type: 'varchar',
    length: 100,
    nullable: true,
    default: 'ALL',
  })
  applicableTo: string | null;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth: number | null;

  @Column({ name: 'period_quarter', type: 'int', nullable: true })
  periodQuarter: number | null;

  @Column({ name: 'period_year', type: 'int', nullable: true })
  periodYear: number | null;

  @Column({ name: 'is_mandatory', type: 'boolean', default: false })
  isMandatory: boolean;

  @Column({ name: 'verified_by_crm', type: 'boolean', default: false })
  verifiedByCrm: boolean;

  @Column({ name: 'crm_verified_at', type: 'timestamptz', nullable: true })
  crmVerifiedAt: Date | null;

  @Column({ name: 'crm_verified_by', type: 'uuid', nullable: true })
  crmVerifiedBy: string | null;

  @Column({ name: 'verified_by_auditor', type: 'boolean', default: false })
  verifiedByAuditor: boolean;

  @Column({ name: 'auditor_verified_at', type: 'timestamptz', nullable: true })
  auditorVerifiedAt: Date | null;

  @Column({ name: 'auditor_verified_by', type: 'uuid', nullable: true })
  auditorVerifiedBy: string | null;

  @Column({ name: 'master_document_id', type: 'int', nullable: true })
  masterDocumentId: number | null;

  /* ─── timestamps ─── */

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
