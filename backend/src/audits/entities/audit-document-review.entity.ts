import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ComplianceMark = 'COMPLIED' | 'NON_COMPLIED' | 'NOT_APPLICABLE';

@Entity('audit_document_reviews')
export class AuditDocumentReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'audit_id', type: 'uuid' })
  auditId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({
    name: 'source_table',
    type: 'varchar',
    length: 30,
    default: 'contractor_documents',
  })
  sourceTable: string;

  @Column({ name: 'checklist_item_id', type: 'uuid', nullable: true })
  checklistItemId: string | null;

  @Column({ name: 'compliance_mark', type: 'varchar', length: 20 })
  complianceMark: ComplianceMark;

  @Column({ name: 'auditor_remark', type: 'text', nullable: true })
  auditorRemark: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'reviewed_by', type: 'uuid' })
  reviewedBy: string;

  @Column({
    name: 'reviewed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  reviewedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
