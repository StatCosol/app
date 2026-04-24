import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('audit_resubmissions')
export class AuditResubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'audit_id', type: 'uuid' })
  auditId: string;

  @Column({ name: 'non_compliance_id', type: 'uuid' })
  nonComplianceId: string;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ name: 'source_table', type: 'varchar', length: 30, nullable: true })
  sourceTable: string | null;

  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 512, nullable: true })
  fileName: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 128, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ name: 'resubmitted_by', type: 'uuid' })
  resubmittedBy: string;

  @Column({
    name: 'resubmitted_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  resubmittedAt: Date;

  @Column({ name: 'auditor_remark', type: 'text', nullable: true })
  auditorRemark: string | null;

  @Column({ name: 'final_mark', type: 'varchar', length: 20, nullable: true })
  finalMark: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
