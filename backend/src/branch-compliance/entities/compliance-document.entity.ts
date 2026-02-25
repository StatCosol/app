import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BranchEntity } from '../../branches/entities/branch.entity';

export enum ComplianceDocStatus {
  NOT_UPLOADED = 'NOT_UPLOADED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REUPLOAD_REQUIRED = 'REUPLOAD_REQUIRED',
  RESUBMITTED = 'RESUBMITTED',
  OVERDUE = 'OVERDUE',
}

export enum ModuleSource {
  BRANCHDESK = 'BRANCHDESK',
  CRM = 'CRM',
  CONTRACTOR = 'CONTRACTOR',
  AUDITXPERT = 'AUDITXPERT',
}

export enum DocumentScope {
  BRANCH = 'BRANCH',
  CONTRACTOR = 'CONTRACTOR',
  COMPANY = 'COMPANY',
}

@Entity('compliance_documents')
export class ComplianceDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Index('idx_compdoc_company')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Index('idx_compdoc_branch')
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { eager: false })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity | null;

  @Column({ name: 'module_source', type: 'varchar', length: 30, default: ModuleSource.BRANCHDESK })
  moduleSource: string;

  @Column({ name: 'document_scope', type: 'varchar', length: 20, default: DocumentScope.BRANCH })
  documentScope: string;

  @Column({ name: 'law_area', type: 'varchar', length: 40 })
  lawArea: string;

  @Index('idx_compdoc_retcode')
  @Column({ name: 'return_code', type: 'varchar', length: 60 })
  returnCode: string;

  @Column({ name: 'return_name', type: 'varchar', length: 200 })
  returnName: string;

  @Column({ name: 'frequency', type: 'varchar', length: 20, default: 'MONTHLY' })
  frequency: string;

  @Column({ name: 'period_year', type: 'int' })
  periodYear: number;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth: number | null;

  @Column({ name: 'period_quarter', type: 'int', nullable: true })
  periodQuarter: number | null;

  @Column({ name: 'period_half', type: 'int', nullable: true })
  periodHalf: number | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'uploaded_file_url', type: 'varchar', length: 500, nullable: true })
  uploadedFileUrl: string | null;

  @Column({ name: 'uploaded_file_name', type: 'varchar', length: 300, nullable: true })
  uploadedFileName: string | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId: string | null;

  @Column({ name: 'uploaded_at', type: 'timestamptz', nullable: true })
  uploadedAt: Date | null;

  @Index('idx_compdoc_status')
  @Column({ name: 'status', type: 'varchar', length: 30, default: ComplianceDocStatus.NOT_UPLOADED })
  status: string;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'uploader_remarks', type: 'text', nullable: true })
  uploaderRemarks: string | null;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
