import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NcStatus =
  | 'NC_RAISED'
  | 'AWAITING_REUPLOAD'
  | 'REUPLOADED'
  | 'REVERIFICATION_PENDING'
  | 'ACCEPTED'
  | 'CLOSED';

@Entity('audit_non_compliances')
export class AuditNonComplianceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'audit_id', type: 'uuid' })
  auditId: string;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ name: 'source_table', type: 'varchar', length: 30, nullable: true })
  sourceTable: string | null;

  @Column({ name: 'checklist_item_id', type: 'uuid', nullable: true })
  checklistItemId: string | null;

  @Column({ name: 'document_review_id', type: 'uuid', nullable: true })
  documentReviewId: string | null;

  @Column({
    name: 'document_name',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  documentName: string | null;

  @Column({
    name: 'requested_to_role',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  requestedToRole: string | null;

  @Column({ name: 'requested_to_user_id', type: 'uuid', nullable: true })
  requestedToUserId: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'NC_RAISED' })
  status: NcStatus;

  @Column({
    name: 'raised_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  raisedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
