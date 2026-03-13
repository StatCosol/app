import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'branch_safety_upload' })
export class BranchSafetyUploadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'doc_master_id', type: 'int' })
  docMasterId: number;

  @Column({ name: 'period_month', type: 'date' })
  periodMonth: string;

  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt: Date;

  @Column({ type: 'text', default: 'UPLOADED' })
  status: 'UPLOADED' | 'REJECTED' | 'EXPIRED';

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
