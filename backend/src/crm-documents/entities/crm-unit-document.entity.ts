import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'crm_unit_documents' })
@Index(['clientId', 'month'])
@Index(['branchId', 'month'])
@Index(['clientId', 'branchId', 'month'])
export class CrmUnitDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'scope', type: 'varchar', length: 20, default: 'BRANCH' })
  scope!: 'COMPANY' | 'BRANCH';

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'month', type: 'varchar', length: 7, nullable: true })
  month!: string | null; // YYYY-MM

  @Column({ name: 'law_category', type: 'varchar', length: 50 })
  lawCategory!: string; // PF / ESI / PT / FACTORY / CLRA / OTHER

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType!: string; // Return / Receipt / Challan / Acknowledgement / Other

  @Column({ name: 'period_from', type: 'date', nullable: true })
  periodFrom!: Date | null;

  @Column({ name: 'period_to', type: 'date', nullable: true })
  periodTo!: Date | null;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName!: string;

  @Column({ name: 'file_path', type: 'varchar', length: 1000 })
  filePath!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType!: string | null;

  @Column({
    name: 'file_size',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: any) => v,
      from: (v: any) => (v ? Number(v) : null),
    },
  })
  fileSize!: number | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy!: string | null;

  @Column({
    name: 'uploaded_by_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  uploadedByRole!: string | null;

  @Column({ name: 'acting_on_behalf', type: 'boolean', default: false })
  actingOnBehalf!: boolean;

  @Column({
    name: 'original_owner_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  originalOwnerRole!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
