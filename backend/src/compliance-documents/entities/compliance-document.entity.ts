import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DocumentCategory =
  | 'RETURN'
  | 'REGISTER'
  | 'LICENSE'
  | 'MCD'
  | 'AUDIT_REPORT';

@Entity({ name: 'compliance_doc_library' })
@Index(['clientId', 'branchId'])
@Index(['clientId', 'category'])
@Index(['clientId', 'periodYear', 'periodMonth'])
export class ComplianceDocLibraryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'category', type: 'varchar', length: 60 })
  category!: DocumentCategory;

  @Column({
    name: 'sub_category',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  subCategory!: string | null;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'file_path', type: 'text' })
  filePath!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize!: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'period_year', type: 'int', nullable: true })
  periodYear!: number | null;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth!: number | null;

  @Column({ name: 'period_label', type: 'varchar', length: 30, nullable: true })
  periodLabel!: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @Column({
    name: 'uploaded_role',
    type: 'varchar',
    length: 30,
    default: 'CRM',
  })
  uploadedRole!: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
