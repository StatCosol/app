import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('audit_checklist_items')
export class AuditChecklistItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'audit_id', type: 'uuid' })
  auditId: string;

  @Column({ name: 'item_label', type: 'varchar', length: 255 })
  itemLabel: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 100, nullable: true })
  docType: string | null;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @Column({ name: 'linked_doc_id', type: 'uuid', nullable: true })
  linkedDocId: string | null;

  @Column({
    name: 'linked_doc_table',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  linkedDocTable: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
