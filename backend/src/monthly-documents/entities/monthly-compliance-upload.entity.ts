import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'monthly_compliance_uploads' })
@Index(['branchId', 'month'])
@Index(['branchId', 'month', 'code'])
@Index(['clientId'])
export class MonthlyComplianceUploadEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  /** YYYY-MM format */
  @Column({ name: 'month', type: 'varchar', length: 7 })
  month!: string;

  /** Compliance item code (e.g. AP_MCD_WAGES_REG, TG_RET_PF_ECR) */
  @Column({ name: 'code', type: 'varchar', length: 100 })
  code!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath!: string;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize!: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
