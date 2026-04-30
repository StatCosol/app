import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('payroll_input_files')
@Index('idx_pif_input', ['payrollInputId'])
export class PayrollInputFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'payroll_input_id' })
  payrollInputId: string;

  @Column({ type: 'varchar', length: 80, name: 'doc_type', nullable: true })
  docType: string | null;

  @Column({ type: 'varchar', length: 300, name: 'file_name' })
  fileName: string;

  @Column({ type: 'text', name: 'file_path' })
  filePath: string;

  @Column({ type: 'varchar', length: 120, name: 'file_type' })
  fileType: string;

  @Column({ type: 'bigint', name: 'file_size' })
  fileSize: string;

  @Column({ type: 'uuid', name: 'uploaded_by_user_id' })
  uploadedByUserId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
